/** Modelo de dominio de citas y de su SAGA (sin dependencias de frameworks). */

export type CitaEstado =
  | 'PENDIENTE'
  | 'RESERVADA'
  | 'COBRO_PROVISIONAL'
  | 'CONFIRMADA'
  | 'CANCELADA' // compensada antes de existir un cobro conocido
  | 'ANULADA'; // compensada habiendo un cobro (que se anula)

export type NotificacionEstado = 'NO_APLICA' | 'PENDIENTE' | 'ENVIADA';

export interface CitaInput {
  pacienteId: string;
  medicoId: string;
  especialidad: string;
  /** ISO 8601 UTC normalizado (Date.toISOString). */
  fechaHora: string;
}

export interface NotificacionInfo {
  estado: NotificacionEstado;
  intentos: number;
  /** epoch ms del proximo reintento (solo si estado = PENDIENTE). */
  proximoIntento?: number;
}

// --- SAGA ---------------------------------------------------------------------------------------

export type SagaEstado = 'EN_CURSO' | 'COMPLETADA' | 'COMPENSADA';
export type SagaPaso = 'COBRO_PROVISIONAL' | 'NOTIFICACION' | 'FIN';

export interface HistorialEntry {
  /** epoch ms */
  at: number;
  paso: string;
  evento: string;
  detalle?: string;
}

export interface SagaState {
  sagaId: string;
  estado: SagaEstado;
  paso: SagaPaso;
  /** Intentos del paso actual (el primero cuenta como 1). */
  intentos: number;
  /** epoch ms en que vence el paso actual (null si no hay paso activo). */
  deadline: number | null;
  /** El cobro llego a solicitarse (puede existir en MS6 aunque no hayamos recibido la respuesta). */
  cobroSolicitado: boolean;
  /** Tras compensar: la anulacion del cobro esta pendiente de confirmacion de MS6. */
  anulacionCobro?: 'PENDIENTE' | 'CONFIRMADA';
  /** Compensaciones ejecutadas, en orden. */
  compensaciones: string[];
  historial: HistorialEntry[];
}

export interface CitaAggregate {
  citaId: string;
  input: CitaInput;
  estado: CitaEstado;
  facturaId?: string;
  motivoFallo?: string;
  notificacion: NotificacionInfo;
  saga: SagaState;
  createdAt: number;
  updatedAt: number;
  /** Version optimista del agregado. */
  version: number;
}

// --- Horarios -----------------------------------------------------------------------------------

export type HorarioEstado = 'LIBRE' | 'RESERVADO' | 'CONFIRMADO';

export interface Horario {
  medicoId: string;
  fechaHora: string;
  estado: HorarioEstado;
  citaId?: string;
  /** epoch ms; solo en RESERVADO. */
  reservaExpiraEn?: number;
}

/**
 * Estado efectivo: una reserva vencida equivale a LIBRE. Se calcula al LEER; no se depende del TTL de DynamoDB,
 * que puede tardar hasta 48 h en borrar.
 */
export function estadoEfectivo(h: Horario | undefined, now: number): HorarioEstado {
  if (!h) return 'LIBRE';
  if (h.estado === 'RESERVADO' && (h.reservaExpiraEn ?? 0) < now) return 'LIBRE';
  return h.estado;
}

export type HorarioOp =
  | { op: 'RESERVAR'; medicoId: string; fechaHora: string; citaId: string; expiraEn: number }
  | { op: 'CONFIRMAR'; medicoId: string; fechaHora: string; citaId: string }
  | { op: 'LIBERAR'; medicoId: string; fechaHora: string; citaId: string };

/** Mensaje que la SAGA envia por RabbitMQ (se escribe en el outbox, en la misma transaccion). */
export interface SagaCommand {
  type: string;
  /** Por defecto sigec.saga; los eventos de dominio van a sigec.eventos. */
  exchange?: string;
  payload: Record<string, unknown>;
}

export class HorarioNoDisponibleError extends Error {
  constructor(
    public readonly medicoId: string,
    public readonly fechaHora: string,
  ) {
    super(`El horario ${fechaHora} del medico ${medicoId} no esta disponible`);
  }
}

export class ConcurrentUpdateError extends Error {
  constructor(citaId: string) {
    super(`La cita ${citaId} fue modificada por otro proceso`);
  }
}

/** Mensaje de la SAGA que debe publicarse (via outbox) en la misma transaccion que el cambio de estado. */
export interface OutboxMessage {
  id: string;
  exchange: string;
  type: string;
  correlationId: string;
  causationId: string | null;
  payload: Record<string, unknown>;
}

/** Al confirmar el horario se descubrio que la reserva ya no es nuestra (expiro y otra cita lo tomo). */
export class HorarioPerdidoError extends Error {
  constructor(public readonly citaId: string) {
    super(`La reserva del horario de la cita ${citaId} se perdio`);
  }
}

export class SolicitudInvalidaError extends Error {}
