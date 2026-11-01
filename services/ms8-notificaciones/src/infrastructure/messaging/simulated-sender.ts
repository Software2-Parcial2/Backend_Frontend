import type { NotificationSender } from '../../application/enviar-notificacion.use-case.js';

/**
 * Adaptador SIMULADO del canal de envio. El canal real (n8n / Mailtrap / Telegram) vendra despues implementando
 * NotificationSender. Para probar fallos: NOTIF_FAIL_PACIENTES=<uuid,uuid> o NOTIF_FAIL_ALL=true.
 */
export class SimulatedSender implements NotificationSender {
  private readonly failing: Set<string>;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    private readonly log: (m: string) => void = () => undefined,
  ) {
    this.failing = new Set((env.NOTIF_FAIL_PACIENTES ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    this.failAll = env.NOTIF_FAIL_ALL === 'true';
  }
  private readonly failAll: boolean;

  async enviar(n: { citaId: string; pacienteId: string; tipo: string }): Promise<{ canal: string }> {
    if (this.failAll || this.failing.has(n.pacienteId)) throw new Error('canal de notificaciones no disponible (simulado)');
    this.log(`[simulado] ${n.tipo} cita=${n.citaId} paciente=${n.pacienteId}`);
    return { canal: 'simulado' };
  }
}
