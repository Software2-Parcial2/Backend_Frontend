import type { CitaAggregate, HorarioOp, OutboxMessage } from '../../domain/cita.js';

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
  listar(limit?: number): Promise<CitaAggregate[]>;
}
