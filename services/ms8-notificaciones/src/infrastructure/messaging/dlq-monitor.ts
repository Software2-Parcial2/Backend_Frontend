import { Logger } from '@nestjs/common';
import { type RabbitConnection, TOPOLOGY } from '@sigec/messaging-nest';
import type { AlertaPort } from '../../application/ports.js';

/**
 * Vigila las colas muertas (`<cola>.dlq` de toda la topologia): si crece el numero de mensajes avisa a los administradores
 * (alerta interna). Usa un canal por consulta para que una cola inexistente (404) no cierre un canal compartido.
 */
export class DlqMonitor {
  private readonly log = new Logger('DlqMonitor');
  private readonly vistos = new Map<string, number>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly connection: RabbitConnection,
    private readonly alertas: AlertaPort,
  ) {}

  start(intervaloMs: number) {
    this.timer = setInterval(() => void this.revisar().catch((e: Error) => this.log.warn(e.message)), intervaloMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async revisar(): Promise<void> {
    for (const q of TOPOLOGY.queues) {
      const nombre = `${q.name}.dlq`;
      const ch = await this.connection.createChannel();
      ch.on('error', () => undefined);
      try {
        const { messageCount } = await ch.checkQueue(nombre);
        const antes = this.vistos.get(nombre);
        this.vistos.set(nombre, messageCount);
        if (antes !== undefined && messageCount > antes) {
          await this.alertas.alertar(`${messageCount - antes} mensaje(s) nuevo(s) en la DLQ ${nombre} (total ${messageCount}). Revisar y, si procede, make dlq-replay QUEUE=${q.name}`);
        }
      } catch {
        /* la cola aun no existe */
      } finally {
        await ch.close().catch(() => undefined);
      }
    }
  }
}
