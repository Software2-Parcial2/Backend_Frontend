package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

public record SolicitudResponse(
		UUID id,
		UUID pacienteId,
		String pacienteNombre,
		SolicitudActualizacion.Campo campo,
		String valorActual,
		String valorPropuesto,
		SolicitudActualizacion.Estado estado,
		String motivoRechazo,
		Instant solicitadaEn,
		Instant resueltaEn,
		String resueltaPor) {
}
