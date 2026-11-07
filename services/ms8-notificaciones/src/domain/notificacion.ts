/** Modelo de dominio de notificaciones (sin dependencias de frameworks). */

export type Canal = 'EMAIL' | 'TELEGRAM';
export type NotificacionTipo =
  | 'CITA_CONFIRMADA'
  | 'CITA_CANCELADA'
  | 'CITA_REPROGRAMADA'
  | 'RECORDATORIO'
  | 'RECORDATORIO_REFUERZO'
  | 'ESTUDIO_VALIDADO';
export const TIPOS: NotificacionTipo[] = ['CITA_CONFIRMADA', 'CITA_CANCELADA', 'CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO'];
/** Avisos que el paciente puede apagar. Confirmacion y cancelacion son transaccionales y se envian siempre. */
export const TIPOS_OPCIONALES: NotificacionTipo[] = ['CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO'];
export const ANTELACIONES_HORAS = [2, 6, 12, 24, 48];
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
  /** Para ESTUDIO_VALIDADO, `citaId` guarda el id del estudio (la referencia del aviso). */
  /** true si un operador la reenvio: la SAGA ya tenia su respuesta, no se responde de nuevo. */
  reenviada?: boolean;
  leida?: boolean;
  leidaEn?: string;
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
  /** Avisos opcionales que el paciente quiere recibir. Sin valor = todos. */
  tiposAviso?: NotificacionTipo[];
  /** Horas de antelacion del recordatorio (2, 6, 12, 24 o 48). Sin valor = 24. */
  antelacionHoras?: number;
}

/** Alertas internas que recibe un usuario del personal. */
export interface PreferenciasPersonal {
  usuarioId: string;
  alertas: { sagaCompensada: boolean; notificacionFallida: boolean; colaDeErrores: boolean };
  actualizadaEn: string;
}

export type CanalPlantilla = Canal;

/** Plantilla editable por el administrador; cada cambio crea una version nueva (la 0 es la de fabrica, no se guarda). */
export interface Plantilla {
  tipo: NotificacionTipo;
  canal: Canal;
  asunto: string;
  cuerpo: string;
  version: number;
  actualizadoPor: string;
  actualizadoEn: string;
}

/** Regla de negocio con codigo estable: 404, 409 (conflicto) o 422. */
export class ReglaNotificacionError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
    readonly extras: Record<string, unknown> = {},
  ) {
    super(message);
  }
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

/** Clave de una notificacion dentro de su cita: el tipo, salvo la reprogramacion que es una por nueva fecha. */
export const claveDe = (tipo: NotificacionTipo, fechaHora?: string): string => (tipo === 'CITA_REPROGRAMADA' ? `${tipo}@${fechaHora ?? ''}` : tipo);
