import type { CitaAggregate } from '../../domain/cita.js';

export type EstadoPaso = 'COMPLETADO' | 'EN_CURSO' | 'FALLIDO' | 'COMPENSADO' | 'NO_EJECUTADO' | 'PENDIENTE_REINTENTO';

export interface PasoSaga {
  orden: number;
  servicio: 'MS3' | 'MS6' | 'MS8';
  nombre: string;
  estado: EstadoPaso;
  detalle: string | null;
  /** Que se deshace si este paso falla (informativo, para la pantalla de la SAGA). */
  siFalla: string;
  en: string | null;
}

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
const buscar = (a: CitaAggregate, evento: string) => a.saga.historial.find((h) => h.evento === evento);

/**
 * Los pasos de la SAGA de una cita tal como los muestra la pantalla de detalle: reserva (MS3), cobro provisional (MS6) y aviso (MS8),
 * mas la compensacion si la hubo. Se deriva del historial del agregado; no se guarda aparte.
 */
export function derivarPasos(a: CitaAggregate): { pasos: PasoSaga[]; compensacion: { acciones: string[]; motivo: string | null; en: string | null } | null } {
  const compensada = a.saga.estado === 'COMPENSADA';
  const reserva = buscar(a, 'HORARIO_RESERVADO');
  const cobroOk = buscar(a, 'COBRO_REGISTRADO');
  const cobroFallo = a.saga.historial.find((h) => ['COBRO_RECHAZADO', 'TIMEOUT_AGOTADO', 'HORARIO_PERDIDO'].includes(h.evento));
  const avisoOk = buscar(a, 'NOTIFICACION_ENVIADA');
  const avisoFallo = a.saga.historial.find((h) => ['NOTIFICACION_FALLIDA', 'NOTIFICACION_AGOTADA'].includes(h.evento));

  const cobro: PasoSaga = {
    orden: 2,
    servicio: 'MS6',
    nombre: 'Cobro provisional',
    estado: cobroOk && !(compensada && a.saga.anulacionCobro) ? 'COMPLETADO' : cobroOk ? 'COMPENSADO' : cobroFallo ? 'FALLIDO' : a.saga.estado === 'EN_CURSO' ? 'EN_CURSO' : 'NO_EJECUTADO',
    detalle: cobroOk?.detalle ?? cobroFallo?.detalle ?? null,
    siFalla: 'Anular el cobro, conservando la trazabilidad',
    en: iso((cobroOk ?? cobroFallo)?.at),
  };
  if (compensada && cobroOk) cobro.estado = 'COMPENSADO';
  if (compensada && !cobroOk && cobroFallo) cobro.estado = 'FALLIDO';

  const aviso: PasoSaga = {
    orden: 3,
    servicio: 'MS8',
    nombre: 'Notificaciones',
    estado: avisoOk ? 'COMPLETADO' : avisoFallo ? 'PENDIENTE_REINTENTO' : a.saga.estado === 'EN_CURSO' && a.saga.paso === 'NOTIFICACION' ? 'EN_CURSO' : 'NO_EJECUTADO',
    detalle: avisoOk ? null : (avisoFallo?.detalle ?? null),
    siFalla: 'Se reintenta; no se cancela una cita valida',
    en: iso((avisoOk ?? avisoFallo)?.at),
  };

  const pasos: PasoSaga[] = [
    { orden: 1, servicio: 'MS3', nombre: 'Reserva temporal del horario', estado: reserva ? (compensada ? 'COMPENSADO' : 'COMPLETADO') : 'NO_EJECUTADO', detalle: reserva?.detalle ?? null, siFalla: 'Liberar la reserva', en: iso(reserva?.at) },
    cobro,
    aviso,
  ];
  const c = a.saga.historial.find((h) => h.paso === 'COMPENSACION' && h.evento.includes('>'));
  return {
    pasos,
    compensacion: compensada || a.saga.compensaciones.length > 0 ? { acciones: a.saga.compensaciones, motivo: a.motivoFallo ?? a.cancelacion?.motivo ?? null, en: iso(c?.at ?? a.updatedAt) } : null,
  };
}
