import type { CitaAggregate } from '../../domain/cita.js';

/** Vista de la API de una cita con el estado de su SAGA, sus pasos y el motivo de fallo. */
export function toView(c: CitaAggregate) {
  return {
    citaId: c.citaId,
    sagaId: c.saga.sagaId,
    estado: c.estado,
    pacienteId: c.input.pacienteId,
    medicoId: c.input.medicoId,
    especialidad: c.input.especialidad,
    fechaHora: c.input.fechaHora,
    facturaId: c.facturaId ?? null,
    notificacion: c.notificacion.estado,
    motivoFallo: c.motivoFallo ?? null,
    saga: {
      estado: c.saga.estado,
      paso: c.saga.paso,
      intentos: c.saga.intentos,
      venceEn: c.saga.deadline ? new Date(c.saga.deadline).toISOString() : null,
      compensaciones: c.saga.compensaciones,
      anulacionCobro: c.saga.anulacionCobro ?? null,
    },
    pasos: c.saga.historial.map((h) => ({ en: new Date(h.at).toISOString(), paso: h.paso, evento: h.evento, detalle: h.detalle ?? null })),
    creadaEn: new Date(c.createdAt).toISOString(),
    actualizadaEn: new Date(c.updatedAt).toISOString(),
  };
}
