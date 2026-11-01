import type { Options } from 'amqplib';
import type { RabbitConnection } from './connection.js';
import type { Envelope } from './envelope.js';
import { validateMessage } from './schema-validator.js';
import { declareExchanges } from './topology.js';

/**
 * Publica sobres con mensajes persistentes y publisher confirms: la promesa solo se
 * resuelve cuando el broker confirma. Si el broker rechaza (nack) o la conexion cae, rechaza.
 */
export class RabbitPublisher {
  private declared = false;

  constructor(private readonly connection: RabbitConnection) {}

  async publish(exchange: string, envelope: Envelope, headers: Record<string, unknown> = {}): Promise<void> {
    validateMessage(envelope); // un productor nunca emite un mensaje que viole el contrato
    await this.publishRaw(exchange, envelope.type, Buffer.from(JSON.stringify(envelope)), {
      messageId: envelope.id,
      type: envelope.type,
      correlationId: envelope.correlationId,
      timestamp: Math.floor(Date.parse(envelope.occurredAt) / 1000),
      headers,
    });
  }

  /** Publicacion de bajo nivel (la usa tambien el consumidor para reintentos y DLQ). */
  async publishRaw(exchange: string, routingKey: string, content: Buffer, options: Options.Publish = {}): Promise<void> {
    const ch = await this.connection.getChannel();
    if (!this.declared) {
      await declareExchanges(ch);
      this.declared = true;
    }
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        exchange,
        routingKey,
        content,
        { persistent: true, contentType: 'application/json', mandatory: false, ...options },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }
}
