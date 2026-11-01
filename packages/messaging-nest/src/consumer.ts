import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { RabbitConnection } from './connection.js';
import { type Envelope, InvalidEnvelopeError } from './envelope.js';
import { validateMessage } from './schema-validator.js';
import { RabbitPublisher } from './publisher.js';
import { declareConsumerQueue, EXCHANGE_DLX, EXCHANGE_RETRY, type QueueSpec, type RetryTier, TOPOLOGY } from './topology.js';

export interface HandlerContext {
  /** Numero de reintentos ya consumidos (0 en la primera entrega). */
  retries: number;
  rawMessage: ConsumeMessage;
}

export type MessageHandler = (envelope: Envelope, ctx: HandlerContext) => Promise<void>;

/**
 * Evita ejecutar dos veces el mismo mensaje (dedupe por `id`).
 * tryBegin devuelve false si el mensaje ya se proceso; release permite reintentar tras un fallo.
 */
export interface MessageDeduplicator {
  /** true = ejecutar; false = ya procesado (se descarta con ack). Puede lanzar si otro consumidor lo tiene en curso. */
  tryBegin(messageId: string): Promise<boolean>;
  /** Marca el mensaje como COMPLETADO (se llama tras ejecutar el handler con exito). */
  complete?(messageId: string): Promise<void>;
  release(messageId: string): Promise<void>;
}

export interface ConsumerOptions {
  spec: QueueSpec;
  handler: MessageHandler;
  prefetch?: number;
  maxRetries?: number;
  tiers?: readonly RetryTier[];
  deduplicator?: MessageDeduplicator;
  onLog?: (msg: string) => void;
}

/**
 * Consumidor con ack manual, reintentos limitados por colas de espera y paso a DLQ.
 * - Mensaje invalido (no JSON / sobre invalido): DLQ directa.
 * - Fallo del handler: el original se confirma (ack) DESPUES de que la copia para reintento o DLQ
 *   fue confirmada por el broker; si eso falla, nack con requeue (nunca se pierde).
 * - Si se pierde la conexion, vuelve a suscribirse solo.
 */
export class RabbitConsumer {
  private channel: ConfirmChannel | null = null;
  private stopped = false;
  private starting = false;
  private readonly publisher: RabbitPublisher;
  private readonly maxRetries: number;
  private readonly tiers: readonly RetryTier[];
  private unsubscribe?: () => void;

  constructor(
    private readonly connection: RabbitConnection,
    private readonly options: ConsumerOptions,
  ) {
    this.publisher = new RabbitPublisher(connection);
    this.maxRetries = options.maxRetries ?? TOPOLOGY.retry.maxRetries;
    this.tiers = options.tiers ?? TOPOLOGY.retry.tiers;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.unsubscribe = this.connection.onDisconnect(() => void this.restartLater());
    await this.subscribe();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    await this.channel?.close().catch(() => undefined);
    this.channel = null;
  }

  private log(msg: string) {
    this.options.onLog?.(`[${this.options.spec.name}] ${msg}`);
  }

  private async restartLater(): Promise<void> {
    if (this.stopped) return;
    this.channel = null;
    for (let attempt = 1; !this.stopped; attempt++) {
      await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 5000)));
      try {
        await this.subscribe();
        this.log('resuscrito tras reconexion');
        return;
      } catch (e) {
        this.log(`reconexion fallida: ${(e as Error).message}`);
      }
    }
  }

  private async subscribe(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      const ch = await this.connection.createChannel();
      await declareConsumerQueue(ch, this.options.spec, this.tiers);
      await ch.prefetch(this.options.prefetch ?? 10);
      await ch.consume(this.options.spec.name, (msg) => msg && void this.onMessage(ch, msg), { noAck: false });
      this.channel = ch;
    } finally {
      this.starting = false;
    }
  }

  private async onMessage(ch: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
    const queue = this.options.spec.name;
    const retries = Number(msg.properties.headers?.['x-retries'] ?? 0);
    let envelope: Envelope;
    try {
      envelope = validateMessage(JSON.parse(msg.content.toString('utf8')));
    } catch (e) {
      const reason = e instanceof InvalidEnvelopeError ? e.message : 'no es JSON valido';
      this.log(`mensaje invalido -> DLQ (${reason})`);
      await this.toDlq(ch, msg, reason);
      return;
    }

    const dedupe = this.options.deduplicator;
    let began = false;
    try {
      if (dedupe) {
        if (!(await dedupe.tryBegin(envelope.id))) {
          this.log(`mensaje ${envelope.id} duplicado, se ignora`);
          ch.ack(msg);
          return;
        }
        began = true;
      }
      await this.options.handler(envelope, { retries, rawMessage: msg });
      await dedupe?.complete?.(envelope.id);
      ch.ack(msg);
    } catch (e) {
      // Solo se libera si ESTE consumidor tomo el id (si tryBegin lanzo porque otro lo tiene, no se toca).
      if (began) await dedupe?.release(envelope.id).catch(() => undefined);
      const reason = (e as Error).message ?? String(e);
      try {
        if (retries >= this.maxRetries) {
          this.log(`${envelope.id} agoto ${this.maxRetries} reintentos -> DLQ (${reason})`);
          await this.toDlq(ch, msg, reason);
        } else {
          const tier = this.tiers[Math.min(retries, this.tiers.length - 1)];
          this.log(`${envelope.id} fallo (${reason}); reintento ${retries + 1}/${this.maxRetries} en ${tier.ttlMs} ms`);
          await this.publisher.publishRaw(EXCHANGE_RETRY, `${queue}.${tier.suffix}`, msg.content, {
            messageId: msg.properties.messageId,
            type: msg.properties.type,
            correlationId: msg.properties.correlationId,
            timestamp: msg.properties.timestamp,
            headers: { ...msg.properties.headers, 'x-retries': retries + 1, 'x-last-error': reason.slice(0, 500) },
          });
          ch.ack(msg);
        }
      } catch (publishError) {
        this.log(`no se pudo reencolar (${(publishError as Error).message}); nack con requeue`);
        ch.nack(msg, false, true);
      }
    }
  }

  private async toDlq(ch: ConfirmChannel, msg: ConsumeMessage, reason: string): Promise<void> {
    try {
      await this.publisher.publishRaw(EXCHANGE_DLX, `${this.options.spec.name}.dlq`, msg.content, {
        messageId: msg.properties.messageId,
        headers: { ...msg.properties.headers, 'x-last-error': reason.slice(0, 500) },
      });
      ch.ack(msg);
    } catch {
      ch.nack(msg, false, true);
    }
  }
}
