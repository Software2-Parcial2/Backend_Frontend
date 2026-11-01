import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib';
import type { RecordPublisher } from './publisher.ts';

/** Exchanges de la topologia (contracts/events/topology.json); se declaran por si el handler llega primero. */
const EXCHANGES: [string, string][] = [
  ['sigec.saga', 'direct'],
  ['sigec.eventos', 'topic'],
  ['sigec.retry', 'direct'],
  ['sigec.dlx', 'direct'],
];

/** Publicador con confirms y reconexion; mensajes persistentes. */
export class AmqpPublisher implements RecordPublisher {
  private conn: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;

  constructor(private readonly url: string) {}

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    const conn = await amqp.connect(this.url);
    const reset = () => {
      if (this.conn === conn) {
        this.conn = null;
        this.channel = null;
      }
    };
    conn.on('error', reset);
    conn.on('close', reset);
    const ch = await conn.createConfirmChannel();
    for (const [name, type] of EXCHANGES) await ch.assertExchange(name, type, { durable: true });
    this.conn = conn;
    this.channel = ch;
    return ch;
  }

  async publish(exchange: string, routingKey: string, body: string, messageId: string): Promise<void> {
    const ch = await this.getChannel();
    await new Promise<void>((resolve, reject) => {
      ch.publish(
        exchange,
        routingKey,
        Buffer.from(body),
        { persistent: true, contentType: 'application/json', messageId, type: routingKey },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async close(): Promise<void> {
    const conn = this.conn;
    this.conn = null;
    this.channel = null;
    await conn?.close().catch(() => undefined);
  }
}

export function rabbitUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.RABBITMQ_URL ??
    `amqp://${encodeURIComponent(env.RABBITMQ_USER ?? 'sigec')}:${encodeURIComponent(env.RABBITMQ_PASSWORD ?? 'cambia_esto')}@${env.RABBITMQ_HOST ?? 'localhost'}:${env.RABBITMQ_PORT ?? '5672'}`
  );
}
