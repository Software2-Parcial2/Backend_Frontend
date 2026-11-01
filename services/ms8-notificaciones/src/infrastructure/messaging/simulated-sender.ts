import type { Canal } from '../../domain/notificacion.js';
import type { NotificationSender } from '../../application/ports.js';
import type { Mensaje } from '../../application/plantillas.js';

/**
 * Doble de prueba del canal (NOTIF_SENDER=simulated): no envia nada. Se usa en las pruebas y en el e2e de la SAGA, que no
 * dependen de n8n. Para forzar fallos: NOTIF_FAIL_PACIENTES=<uuid,uuid> o NOTIF_FAIL_ALL=true.
 */
export class SimulatedSender implements NotificationSender {
  readonly requiereDestinatario = false;
  private readonly failing: Set<string>;
  private readonly failAll: boolean;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    private readonly log: (m: string) => void = () => undefined,
  ) {
    this.failing = new Set((env.NOTIF_FAIL_PACIENTES ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    this.failAll = env.NOTIF_FAIL_ALL === 'true';
  }

  async enviar(m: { canal: Canal; destinatario: string; mensaje: Mensaje; notificacionId: string; pacienteId: string }): Promise<void> {
    if (this.failAll || this.failing.has(m.pacienteId)) throw new Error('canal de notificaciones no disponible (simulado)');
    this.log(`[simulado] ${m.canal} -> ${m.destinatario}: ${m.mensaje.asunto}`);
  }
}
