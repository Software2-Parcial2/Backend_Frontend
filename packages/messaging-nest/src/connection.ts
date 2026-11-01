import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib';

export interface ConnectionOptions {
  url: string;
  /** Milisegundos entre reintentos de conexion. */
  reconnectDelayMs?: number;
  onLog?: (msg: string) => void;
}

/**
 * Conexion perezosa con un canal de confirmacion. Si RabbitMQ cae, el siguiente uso
 * (o el siguiente intento del consumidor) vuelve a conectar.
 */
export class RabbitConnection {
  private conn: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private connecting: Promise<ConfirmChannel> | null = null;
  private closed = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: ConnectionOptions) {}

  /** Devuelve un canal con publisher confirms; conecta si hace falta. */
  async getChannel(): Promise<ConfirmChannel> {
    if (this.closed) throw new Error('RabbitConnection cerrada');
    if (this.channel) return this.channel;
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  /** Canal nuevo e independiente (p. ej. uno por consumidor). */
  async createChannel(): Promise<ConfirmChannel> {
    await this.getChannel();
    return this.conn!.createConfirmChannel();
  }

  /** Se invoca cada vez que se pierde la conexion (para que los consumidores se resuscriban). */
  onDisconnect(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async close(): Promise<void> {
    this.closed = true;
    const conn = this.conn;
    this.conn = null;
    this.channel = null;
    await conn?.close().catch(() => undefined);
  }

  private async open(): Promise<ConfirmChannel> {
    const conn = await amqp.connect(this.options.url);
    const channel = await conn.createConfirmChannel();
    const lost = (reason: string) => (err?: Error) => {
      if (this.conn !== conn) return;
      this.options.onLog?.(`RabbitMQ: ${reason}${err ? ` (${err.message})` : ''}`);
      this.conn = null;
      this.channel = null;
      for (const l of this.listeners) l();
    };
    conn.on('error', (e) => lost('error de conexion')(e));
    conn.on('close', () => lost('conexion cerrada')());
    this.conn = conn;
    this.channel = channel;
    return channel;
  }
}
