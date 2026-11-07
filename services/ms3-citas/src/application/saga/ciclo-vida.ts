import {
  TransicionInvalidaError,
  type CitaAggregate,
  type HistorialEntry,
} from '../../domain/cita.js';
import { CMD, type MachineDeps, type Transition } from './saga-machine.js';

/**
 * Ciclo de vida de una cita YA CONFIRMADA: cancelar, reprogramar y registrar la asistencia. Funciones puras como la maquina de la
 * SAGA: devuelven el nuevo agregado y los efectos (operaciones sobre el horario y mensajes del outbox), que la persistencia aplica
 * de forma atomica. Las citas con la SAGA en curso no se tocan (409 CITA_EN_PROCESO): primero deben terminar o compensarse.
 */

export type AccionAsistencia = 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO';

const entry = (at: number, paso: string, evento: string, detalle?: string): HistorialEntry => ({ at, paso, evento, ...(detalle ? { detalle } : {}) });

const EVENTOS = 'sigec.eventos';

function exigirConfirmada(agg: CitaAggregate): void {
  if (agg.saga.estado === 'EN_CURSO') throw new TransicionInvalidaError('CITA_EN_PROCESO', 'La cita todavia se esta confirmando; intente de nuevo en unos segundos');
  if (agg.estado === 'CANCELADA_USUARIO' || agg.estado === 'CANCELADA' || agg.estado === 'ANULADA') {
    throw new TransicionInvalidaError('CITA_YA_CANCELADA', 'La cita ya esta cancelada');
  }
  if (agg.estado !== 'CONFIRMADA') {
    throw new TransicionInvalidaError('CITA_NO_MODIFICABLE', `La cita esta ${agg.estado.toLowerCase().replace('_', ' ')} y ya no se puede modificar`);
  }
}

/** Cancela una cita confirmada: anula el cobro, libera el horario, avisa al paciente y publica cita.cancelada. */
export function cancelar(agg: CitaAggregate, motivo: string, actor: string, d: MachineDeps): Transition {
  exigirConfirmada(agg);
  if (Date.parse(agg.input.fechaHora) <= d.now) throw new TransicionInvalidaError('CITA_PASADA', 'La cita ya paso y no se puede cancelar');
  const compensaciones = [...(agg.facturaId ? ['ANULAR_COBRO'] : []), 'LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION'];
  const commands: Transition['commands'] = [];
  if (agg.facturaId) {
    commands.push({ type: CMD.cobroAnular, payload: { citaId: agg.citaId, facturaId: agg.facturaId, motivo } });
  }
  commands.push({ type: CMD.notifCancelada, payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, motivo } });
  commands.push({
    type: 'cita.cancelada',
    exchange: EVENTOS,
    payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora, motivo },
  });
  return {
    aggregate: {
      ...agg,
      estado: 'CANCELADA_USUARIO',
      cancelacion: { motivo, por: actor, at: d.now },
      // los reintentos de aviso de confirmacion ya no tienen sentido
      notificacion: { estado: 'NO_APLICA', intentos: 0 },
      updatedAt: d.now,
      saga: {
        ...agg.saga,
        anulacionCobro: agg.facturaId ? 'PENDIENTE' : undefined,
        compensaciones: [...agg.saga.compensaciones, ...compensaciones],
        historial: [...agg.saga.historial, entry(d.now, 'CANCELACION', 'CITA_CANCELADA', `${actor}: ${motivo}`), entry(d.now, 'CANCELACION', 'COMPENSACION', compensaciones.join(' > '))],
      },
    },
    horarioOps: [{ op: 'LIBERAR', medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora, citaId: agg.citaId }],
    commands,
  };
}

/**
 * Cambia la fecha y hora de una cita confirmada. El horario nuevo se toma ya CONFIRMADO y el viejo se libera en la misma
 * transaccion (si el nuevo esta ocupado nada cambia: 409 HORARIO_OCUPADO). El cargo se conserva.
 */
export function reprogramar(agg: CitaAggregate, nuevaFechaHora: string, actor: string, d: MachineDeps): Transition {
  exigirConfirmada(agg);
  const nueva = new Date(nuevaFechaHora);
  if (Number.isNaN(nueva.getTime())) throw new TransicionInvalidaError('FECHA_INVALIDA', 'La nueva fecha no es valida');
  if (nueva.getTime() <= d.now) throw new TransicionInvalidaError('FECHA_PASADA', 'La nueva fecha debe ser futura');
  const hacia = nueva.toISOString();
  if (hacia === agg.input.fechaHora) throw new TransicionInvalidaError('MISMO_HORARIO', 'La nueva fecha es la misma que la actual');
  const anterior = agg.input.fechaHora;
  return {
    aggregate: {
      ...agg,
      input: { ...agg.input, fechaHora: hacia },
      reprogramaciones: [...(agg.reprogramaciones ?? []), { desde: anterior, hacia, por: actor, at: d.now }],
      updatedAt: d.now,
      saga: { ...agg.saga, historial: [...agg.saga.historial, entry(d.now, 'REPROGRAMACION', 'CITA_REPROGRAMADA', `${anterior} > ${hacia} (${actor})`)] },
    },
    horarioOps: [
      { op: 'TOMAR', medicoId: agg.input.medicoId, fechaHora: hacia, citaId: agg.citaId },
      { op: 'LIBERAR', medicoId: agg.input.medicoId, fechaHora: anterior, citaId: agg.citaId },
    ],
    commands: [
      {
        type: 'cita.reprogramada',
        exchange: EVENTOS,
        payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, medicoId: agg.input.medicoId, fechaHora: hacia, fechaHoraAnterior: anterior },
      },
    ],
  };
}

/** Llegada del paciente, atencion o inasistencia. Publica cita.asistencia-registrada (lo usa MS7 para el modelo de inasistencia). */
export function registrarAsistencia(agg: CitaAggregate, accion: AccionAsistencia, actor: string, d: MachineDeps): Transition {
  const noValida = () => new TransicionInvalidaError('ASISTENCIA_INVALIDA', `No se puede registrar ${accion} con la cita en estado ${agg.estado}`);
  let estado: CitaAggregate['estado'];
  let asistencia: CitaAggregate['asistencia'];
  let evento: 'LLEGO' | 'ASISTIO' | 'NO_ASISTIO';
  switch (accion) {
    case 'LLEGO':
      if (agg.estado !== 'CONFIRMADA') throw noValida();
      [estado, evento] = ['EN_SALA', 'LLEGO'];
      break;
    case 'ATENDIDA':
      if (agg.estado !== 'CONFIRMADA' && agg.estado !== 'EN_SALA') throw noValida();
      [estado, asistencia, evento] = ['ATENDIDA', 'ASISTIO', 'ASISTIO'];
      break;
    case 'NO_ASISTIO':
      if (agg.estado !== 'CONFIRMADA') throw noValida();
      if (Date.parse(agg.input.fechaHora) > d.now) throw new TransicionInvalidaError('CITA_FUTURA', 'No se puede marcar inasistencia antes de la hora de la cita');
      [estado, asistencia, evento] = ['NO_ASISTIO', 'NO_ASISTIO', 'NO_ASISTIO'];
      break;
  }
  return {
    aggregate: {
      ...agg,
      estado,
      ...(asistencia ? { asistencia } : {}),
      ...(accion === 'LLEGO' ? { llegadaEn: d.now } : {}),
      notificacion: agg.estado === 'CONFIRMADA' ? { estado: 'NO_APLICA', intentos: 0 } : agg.notificacion,
      updatedAt: d.now,
      saga: { ...agg.saga, historial: [...agg.saga.historial, entry(d.now, 'ATENCION', `ASISTENCIA_${accion}`, actor)] },
    },
    horarioOps: [],
    commands: [
      {
        type: 'cita.asistencia-registrada',
        exchange: EVENTOS,
        payload: { citaId: agg.citaId, pacienteId: agg.input.pacienteId, medicoId: agg.input.medicoId, fechaHora: agg.input.fechaHora, asistencia: evento },
      },
    ],
  };
}
