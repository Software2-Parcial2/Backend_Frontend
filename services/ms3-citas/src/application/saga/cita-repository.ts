import type { CitaAggregate, HorarioOp, OutboxMessage } from '../../domain/cita.js';

export interface FiltroCitas {
  /** Citas de un paciente (indice por paciente). */
  pacienteId?: string;
  /** Citas de un medico, opcionalmente en un rango de fechaHora (epoch ms; indice por medico/fecha). */
  medicoId?: string;
  desde?: number;
  hasta?: number;
}

export interface PaginaCitas {
  items: CitaAggregate[];
  /** Cursor para la siguiente pagina; null si no hay mas. */
  siguiente: string | null;
}

export class CursorInvalidoError extends Error {
  constructor() {
    super('cursor invalido');
  }
}

/** Cambio atomico: agregado (cita + saga) + operaciones sobre el horario + mensajes del outbox. */
export interface CitaChange {
  aggregate: CitaAggregate;
  /** Version que se espera encontrar; null = la cita no existe todavia. */
  expectedVersion: number | null;
  horarioOps: HorarioOp[];
  messages: OutboxMessage[];
}

/**
 * Puerto de persistencia. `aplicar` DEBE ser atomico y lanzar:
 *  - HorarioNoDisponibleError si un RESERVAR choca con una reserva vigente o una cita confirmada,
 *  - HorarioPerdidoError si un CONFIRMAR ya no es dueno de la reserva,
 *  - ConcurrentUpdateError si la version del agregado no coincide.
 */
export interface CitaRepository {
  cargar(citaId: string): Promise<CitaAggregate | null>;
  aplicar(change: CitaChange): Promise<void>;
  /** Citas con SAGA en curso cuyo plazo (deadline) ya vencio. */
  sagasVencidas(now: number, limit?: number): Promise<string[]>;
  /** Citas confirmadas con la notificacion pendiente cuyo proximo intento ya llego. */
  notificacionesPendientes(now: number, limit?: number): Promise<string[]>;
  /** Busca por indice (nunca Scan), mas recientes primero, con paginacion por cursor opaco. */
  buscar(filtro: FiltroCitas, limite: number, cursor?: string): Promise<PaginaCitas>;
}
