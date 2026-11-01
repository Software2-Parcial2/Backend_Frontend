import type { Notificacion, NotificacionTipo, RespuestaSaga } from '../domain/notificacion.js';

/** Puerto de salida: el canal real (n8n, Mailtrap, Telegram...) se enchufa aqui. Lanza si el canal falla. */
export interface NotificationSender {
  enviar(n: { citaId: string; pacienteId: string; tipo: NotificacionTipo }): Promise<{ canal: string }>;
}

/** Puerto de salida: guarda el registro y la respuesta de la SAGA de forma atomica. */
export interface NotificacionRepository {
  registrar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void>;
  porCita(citaId: string): Promise<Notificacion[]>;
}

export interface EnviarNotificacionComando {
  /** Sobre del comando: de aqui salen el correlationId y el causationId de la respuesta. */
  mensajeId: string;
  correlationId: string;
  citaId: string;
  pacienteId: string;
  tipo: NotificacionTipo;
}

/**
 * Atiende notifications.cita-confirmada.enviar / cita-cancelada.enviar.
 * Un fallo del canal NO es una excepcion: se registra como FALLIDA y se responde `...fallida`, para que MS3 decida
 * (la cita no se anula; la notificacion queda pendiente y se reintenta aparte). Las excepciones de infraestructura
 * (p. ej. DynamoDB caido) si se propagan para que el consumidor reintente.
 */
export class EnviarNotificacionUseCase {
  constructor(
    private readonly sender: NotificationSender,
    private readonly repo: NotificacionRepository,
    private readonly newId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ejecutar(cmd: EnviarNotificacionComando): Promise<Notificacion> {
    let notificacion: Notificacion;
    const base = { id: this.newId(), citaId: cmd.citaId, pacienteId: cmd.pacienteId, tipo: cmd.tipo, creadaEn: this.now().toISOString() };
    try {
      const { canal } = await this.sender.enviar({ citaId: cmd.citaId, pacienteId: cmd.pacienteId, tipo: cmd.tipo });
      notificacion = { ...base, estado: 'ENVIADA', canal };
    } catch (e) {
      notificacion = { ...base, estado: 'FALLIDA', canal: 'n/d', error: (e as Error).message };
    }

    // Solo la confirmacion tiene respuesta en el contrato; la cancelacion es "avisar y olvidar".
    const respuesta: RespuestaSaga | null =
      cmd.tipo === 'CITA_CONFIRMADA'
        ? {
            id: this.newId(),
            type: notificacion.estado === 'ENVIADA' ? 'notificaciones.cita-confirmada.enviada' : 'notificaciones.cita-confirmada.fallida',
            correlationId: cmd.correlationId,
            causationId: cmd.mensajeId,
            payload:
              notificacion.estado === 'ENVIADA'
                ? { citaId: cmd.citaId, notificacionId: notificacion.id, canal: notificacion.canal }
                : { citaId: cmd.citaId, motivo: notificacion.error ?? 'error desconocido' },
          }
        : null;
    await this.repo.registrar(notificacion, respuesta);
    return notificacion;
  }
}
