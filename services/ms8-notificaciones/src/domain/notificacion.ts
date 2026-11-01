/** Modelo de dominio de notificaciones (sin dependencias de frameworks). */

export type NotificacionTipo = 'CITA_CONFIRMADA' | 'CITA_CANCELADA';
export type NotificacionEstado = 'ENVIADA' | 'FALLIDA';

export interface Notificacion {
  id: string;
  citaId: string;
  pacienteId: string;
  tipo: NotificacionTipo;
  estado: NotificacionEstado;
  canal: string;
  /** Detalle del fallo si estado = FALLIDA. */
  error?: string;
  /** ISO 8601 */
  creadaEn: string;
}

/** Mensaje de respuesta que debe publicarse (via outbox) en la misma transaccion que el registro. */
export interface RespuestaSaga {
  id: string;
  type: string;
  correlationId: string;
  causationId: string;
  payload: Record<string, unknown>;
}
