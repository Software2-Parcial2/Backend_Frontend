/** Modelo de dominio de notificaciones (sin dependencias de frameworks). */

export type Canal = 'EMAIL' | 'TELEGRAM';
export type NotificacionTipo = 'CITA_CONFIRMADA' | 'CITA_CANCELADA' | 'RECORDATORIO';
/** PENDIENTE = aun por enviar o reintentando; ENVIADA y FALLIDA son finales. */
export type NotificacionEstado = 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';

export interface Notificacion {
  id: string;
  citaId: string;
  pacienteId: string;
  tipo: NotificacionTipo;
  estado: NotificacionEstado;
  /** Canales ya entregados (con varios canales, un reintento solo repite los que faltan). */
  canalesEnviados: Canal[];
  intentos: number;
  /** epoch ms del proximo reintento (solo PENDIENTE con intentos fallidos). */
  proximoIntento?: number;
  ultimoError?: string;
  /** Datos de la cita para renderizar el mensaje. */
  fechaHora?: string;
  motivo?: string;
  /** Id de la SAGA y del comando, para responder con el mismo correlationId (solo CITA_CONFIRMADA). */
  correlationId?: string;
  comandoId?: string;
  creadaEn: string;
  actualizadaEn: string;
  version: number;
}

export interface Contacto {
  pacienteId: string;
  nombre?: string;
  email?: string | null;
  /** Preferencia del paciente. Por defecto solo EMAIL. */
  canales: Canal[];
  telegramChatId?: string;
}

/** Mensaje de respuesta de la SAGA que se publica (via outbox) en la misma transaccion que el registro. */
export interface RespuestaSaga {
  id: string;
  type: string;
  correlationId: string;
  causationId: string;
  payload: Record<string, unknown>;
}

export interface CitaRecordable {
  citaId: string;
  pacienteId: string;
  fechaHora: string;
}

export class VinculoInvalidoError extends Error {}
export class PreferenciasInvalidasError extends Error {}
