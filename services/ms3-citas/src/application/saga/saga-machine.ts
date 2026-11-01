import type {
  CitaAggregate,
  CitaInput,
  HistorialEntry,
  HorarioOp,
  SagaCommand,
} from '../../domain/cita.js';
import type { SagaPolicy } from './saga-policy.js';

/**
 * Maquina de estados explicita de la SAGA de citas. Funciones puras: reciben el agregado y un evento y devuelven
 * el nuevo agregado mas los efectos (operaciones sobre el horario y comandos a enviar). No tocan red ni base de datos;
 * la persistencia aplica la transicion de forma atomica (cita + saga + horario + outbox en una transaccion).
 *
 *   iniciar ──► COBRO_PROVISIONAL ──registrado──► NOTIFICACION ──enviada/fallida/agotada──► FIN (CONFIRMADA)
 *                     │                                   │
 *                     ├─rechazado────────────────► compensar (CANCELADA)
 *                     └─timeout × maxAttempts────► compensar (CANCELADA, anular cobro pendiente)
 *   horario perdido al confirmar ───────────────► compensar (ANULADA)
 */

export type SagaEvent =
  | { type: 'COBRO_REGISTRADO'; facturaId: string; monto: number }
  | { type: 'COBRO_RECHAZADO'; motivo: string }
  | { type: 'COBRO_ANULADO'; facturaId?: string }
  | { type: 'NOTIFICACION_ENVIADA' }
  | { type: 'NOTIFICACION_FALLIDA'; motivo: string }
  | { type: 'TIMEOUT' }
  | { type: 'HORARIO_PERDIDO' }
  | { type: 'REINTENTAR_NOTIFICACION' };

export interface MachineDeps {
  /** epoch ms */
  now: number;
  policy: SagaPolicy;
  /** 0 <= x < 1 */
  random: () => number;
  newId: () => string;
}

export interface Transition {
  aggregate: CitaAggregate;
  horarioOps: HorarioOp[];
  commands: SagaCommand[];
}

export const CMD = {
  cobroSolicitar: 'facturacion.cobro-provisional.solicitar',
  cobroAnular: 'facturacion.cobro.anular',
  cobroConfirmar: 'facturacion.cobro.confirmar',
  notifConfirmada: 'notificaciones.cita-confirmada.enviar',
  notifCancelada: 'notificaciones.cita-cancelada.enviar',
} as const;

const entry = (at: number, paso: string, evento: string, detalle?: string): HistorialEntry => ({ at, paso, evento, ...(detalle ? { detalle } : {}) });

function backoffMs(attempt: number, d: MachineDeps): number {
  return Math.round(d.policy.backoffBaseMs * 2 ** (attempt - 1) * (1 + d.policy.jitterRatio * d.random()));
}

function cobroCommand(agg: CitaAggregate): SagaCommand {
  return {
    type: CMD.cobroSolicitar,
    payload: {
      citaId: agg.citaId,
      pacienteId: agg.input.pacienteId,
      medicoId: agg.input.medicoId,
      especialidad: agg.input.especialidad,
      fechaHora: agg.input.fechaHora,
    },
  };
}

function notifCommand(agg: CitaAggregate): SagaCommand {
  return {
    type: CMD.notifConfirmada,
    payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora },
  };
}

/** Crea la cita y arranca la SAGA: paso 1 (reserva del horario) y envio del paso 2 (cobro provisional). */
export function iniciar(input: CitaInput, d: MachineDeps): Transition {
  const citaId = d.newId();
  const sagaId = d.newId();
  const aggregate: CitaAggregate = {
    citaId,
    input,
    estado: 'RESERVADA',
    notificacion: { estado: 'NO_APLICA', intentos: 0 },
    saga: {
      sagaId,
      estado: 'EN_CURSO',
      paso: 'COBRO_PROVISIONAL',
      intentos: 1,
      deadline: d.now + d.policy.stepTimeoutMs,
      cobroSolicitado: true,
      compensaciones: [],
      historial: [
        entry(d.now, 'RESERVA', 'CITA_CREADA', 'PENDIENTE'),
        entry(d.now, 'RESERVA', 'HORARIO_RESERVADO', `expira en ${Math.round(d.policy.reservaTtlMs / 1000)} s`),
        entry(d.now, 'COBRO_PROVISIONAL', 'COBRO_SOLICITADO', 'intento 1'),
      ],
    },
    createdAt: d.now,
    updatedAt: d.now,
    version: 0,
  };
  return {
    aggregate,
    horarioOps: [{ op: 'RESERVAR', medicoId: input.medicoId, fechaHora: input.fechaHora, citaId, expiraEn: d.now + d.policy.reservaTtlMs }],
    commands: [cobroCommand(aggregate)],
  };
}

/** Aplica un evento. Devuelve null si el evento no procede en el estado actual (se ignora). */
export function aplicar(agg: CitaAggregate, event: SagaEvent, d: MachineDeps): Transition | null {
  const { saga } = agg;
  const next = (patch: Partial<CitaAggregate>, sagaPatch: Partial<CitaAggregate['saga']>, hist: HistorialEntry): CitaAggregate => ({
    ...agg,
    ...patch,
    updatedAt: d.now,
    saga: { ...saga, ...sagaPatch, historial: [...saga.historial, hist] },
  });

  switch (event.type) {
    // --- respuestas del cobro ---------------------------------------------------------------
    case 'COBRO_REGISTRADO': {
      if (saga.estado === 'COMPENSADA') {
        // Respuesta tardia de un cobro que ya compensamos: hay que anularlo.
        return {
          aggregate: next(
            { facturaId: event.facturaId, estado: 'ANULADA' },
            { anulacionCobro: 'PENDIENTE', compensaciones: [...saga.compensaciones, 'ANULAR_COBRO'] },
            entry(d.now, 'COMPENSACION', 'COBRO_TARDIO_ANULANDO', event.facturaId),
          ),
          horarioOps: [],
          commands: [{ type: CMD.cobroAnular, payload: { citaId: agg.citaId, facturaId: event.facturaId, motivo: 'cobro registrado tras compensar la SAGA' } }],
        };
      }
      if (saga.estado !== 'EN_CURSO' || saga.paso !== 'COBRO_PROVISIONAL') return null;
      // El horario se confirma ahora (si la reserva se perdio, la persistencia lo detecta y nos llega HORARIO_PERDIDO).
      return {
        aggregate: next(
          { estado: 'COBRO_PROVISIONAL', facturaId: event.facturaId },
          { paso: 'NOTIFICACION', intentos: 1, deadline: d.now + d.policy.stepTimeoutMs },
          entry(d.now, 'COBRO_PROVISIONAL', 'COBRO_REGISTRADO', `factura ${event.facturaId} monto ${event.monto}`),
        ),
        horarioOps: [{ op: 'CONFIRMAR', medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora, citaId: agg.citaId }],
        commands: [notifCommand(agg)],
      };
    }
    case 'COBRO_RECHAZADO': {
      if (saga.estado !== 'EN_CURSO' || saga.paso !== 'COBRO_PROVISIONAL') return null;
      // MS6 rechazo: no existe cobro que anular, solo se libera el horario.
      return compensar({ ...agg, saga: { ...saga, cobroSolicitado: false } }, `cobro rechazado: ${event.motivo}`, d, 'COBRO_RECHAZADO');
    }
    case 'COBRO_ANULADO': {
      if (saga.anulacionCobro !== 'PENDIENTE') return null;
      return {
        aggregate: next({}, { anulacionCobro: 'CONFIRMADA' }, entry(d.now, 'COMPENSACION', 'COBRO_ANULADO', event.facturaId)),
        horarioOps: [],
        commands: [],
      };
    }

    // --- notificacion -----------------------------------------------------------------------
    case 'NOTIFICACION_ENVIADA': {
      if (saga.estado === 'EN_CURSO' && saga.paso === 'NOTIFICACION') return confirmar(agg, d, 'ENVIADA', 'NOTIFICACION_ENVIADA');
      if (saga.estado === 'COMPLETADA' && agg.notificacion.estado === 'PENDIENTE') {
        // Una notificacion que se daba por pendiente llego al final.
        return {
          aggregate: next({ notificacion: { estado: 'ENVIADA', intentos: agg.notificacion.intentos } }, {}, entry(d.now, 'FIN', 'NOTIFICACION_ENVIADA', 'tras reintento')),
          horarioOps: [],
          commands: [],
        };
      }
      return null;
    }
    case 'NOTIFICACION_FALLIDA': {
      if (saga.estado === 'EN_CURSO' && saga.paso === 'NOTIFICACION') {
        // Un fallo de notificacion NO anula la cita: queda confirmada con la notificacion pendiente.
        return confirmar(agg, d, 'PENDIENTE', 'NOTIFICACION_FALLIDA', event.motivo);
      }
      return null;
    }
    case 'REINTENTAR_NOTIFICACION': {
      if (saga.estado !== 'COMPLETADA' || agg.notificacion.estado !== 'PENDIENTE') return null;
      const intentos = agg.notificacion.intentos + 1;
      if (agg.notificacion.intentos >= d.policy.notificacionMaxReintentos) {
        return {
          aggregate: next({ notificacion: { estado: 'PENDIENTE', intentos: agg.notificacion.intentos } }, {}, entry(d.now, 'FIN', 'NOTIFICACION_ABANDONADA', `tras ${agg.notificacion.intentos} intentos`)),
          horarioOps: [],
          commands: [],
        };
      }
      return {
        aggregate: next(
          { notificacion: { estado: 'PENDIENTE', intentos, proximoIntento: d.now + d.policy.notificacionReintentoMs } },
          {},
          entry(d.now, 'FIN', 'NOTIFICACION_REINTENTO', `intento ${intentos}`),
        ),
        horarioOps: [],
        commands: [notifCommand(agg)],
      };
    }

    // --- tiempo -----------------------------------------------------------------------------
    case 'TIMEOUT': {
      if (saga.estado !== 'EN_CURSO' || saga.deadline === null || saga.deadline > d.now) return null;
      const detalle = `paso ${saga.paso}, intento ${saga.intentos}/${d.policy.maxAttempts}`;
      if (saga.intentos < d.policy.maxAttempts) {
        const intentos = saga.intentos + 1;
        const command = saga.paso === 'COBRO_PROVISIONAL' ? cobroCommand(agg) : notifCommand(agg);
        return {
          aggregate: next(
            {},
            { intentos, deadline: d.now + d.policy.stepTimeoutMs + backoffMs(saga.intentos, d) },
            entry(d.now, saga.paso, 'TIMEOUT_REINTENTO', `${detalle}; reintento ${intentos}`),
          ),
          horarioOps: [],
          commands: [command],
        };
      }
      if (saga.paso === 'COBRO_PROVISIONAL') {
        return compensar(agg, `timeout del cobro tras ${d.policy.maxAttempts} intentos`, d, 'TIMEOUT_AGOTADO');
      }
      // Notificacion agotada: no anula la cita.
      return confirmar(agg, d, 'PENDIENTE', 'NOTIFICACION_AGOTADA', detalle);
    }

    // --- la reserva se perdio ---------------------------------------------------------------
    case 'HORARIO_PERDIDO': {
      if (saga.estado !== 'EN_CURSO') return null;
      return compensar(agg, 'la reserva del horario expiro y fue tomada por otra cita', d, 'HORARIO_PERDIDO');
    }
  }
}

/** Cierra la SAGA con la cita CONFIRMADA. */
function confirmar(agg: CitaAggregate, d: MachineDeps, notificacion: 'ENVIADA' | 'PENDIENTE', evento: string, detalle?: string): Transition {
  const commands: SagaCommand[] = [];
  if (d.policy.confirmarCobro && agg.facturaId) {
    commands.push({ type: CMD.cobroConfirmar, payload: { citaId: agg.citaId, facturaId: agg.facturaId } });
  }
  return {
    aggregate: {
      ...agg,
      estado: 'CONFIRMADA',
      notificacion:
        notificacion === 'ENVIADA'
          ? { estado: 'ENVIADA', intentos: agg.saga.intentos }
          : { estado: 'PENDIENTE', intentos: 0, proximoIntento: d.now + d.policy.notificacionReintentoMs },
      updatedAt: d.now,
      saga: {
        ...agg.saga,
        estado: 'COMPLETADA',
        paso: 'FIN',
        deadline: null,
        historial: [...agg.saga.historial, entry(d.now, 'NOTIFICACION', evento, detalle), entry(d.now, 'FIN', 'CITA_CONFIRMADA')],
      },
    },
    horarioOps: [],
    commands,
  };
}

/**
 * Compensaciones en ORDEN INVERSO a los pasos hechos: primero se anula el cobro (paso 2), luego se libera el horario
 * (paso 1) y por ultimo se avisa al paciente. La anulacion del cobro se encola (outbox) y se confirma de forma asincrona;
 * el horario se libera sin esperarla.
 */
function compensar(agg: CitaAggregate, motivo: string, d: MachineDeps, evento: string): Transition {
  const compensaciones: string[] = [];
  const commands: SagaCommand[] = [];
  const horarioOps: HorarioOp[] = [];

  if (agg.saga.cobroSolicitado) {
    compensaciones.push('ANULAR_COBRO');
    commands.push({ type: CMD.cobroAnular, payload: { citaId: agg.citaId, ...(agg.facturaId ? { facturaId: agg.facturaId } : {}), motivo } });
  }
  compensaciones.push('LIBERAR_HORARIO');
  horarioOps.push({ op: 'LIBERAR', medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora, citaId: agg.citaId });
  compensaciones.push('NOTIFICAR_CANCELACION');
  commands.push({ type: CMD.notifCancelada, payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, motivo } });

  return {
    aggregate: {
      ...agg,
      estado: agg.facturaId ? 'ANULADA' : 'CANCELADA',
      motivoFallo: motivo,
      notificacion: { estado: 'NO_APLICA', intentos: 0 },
      updatedAt: d.now,
      saga: {
        ...agg.saga,
        estado: 'COMPENSADA',
        paso: 'FIN',
        deadline: null,
        anulacionCobro: agg.saga.cobroSolicitado ? 'PENDIENTE' : undefined,
        compensaciones: [...agg.saga.compensaciones, ...compensaciones],
        historial: [...agg.saga.historial, entry(d.now, agg.saga.paso, evento, motivo), entry(d.now, 'COMPENSACION', compensaciones.join(' > '))],
      },
    },
    horarioOps,
    commands,
  };
}
