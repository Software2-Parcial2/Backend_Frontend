package com.sigec.ms2_pacientes.domain.model;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.exception.ReglaNegocioException;

/** Solicitud del paciente para cambiar un dato de contacto; recepcion la aprueba o rechaza. */
public record SolicitudActualizacion(
		UUID id,
		UUID pacienteId,
		Campo campo,
		String valorActual,
		String valorPropuesto,
		Estado estado,
		String motivoRechazo,
		Instant solicitadaEn,
		Instant resueltaEn,
		String resueltaPor) {

	public enum Campo { TELEFONO, EMAIL, DIRECCION }

	public enum Estado { PENDIENTE, APROBADA, RECHAZADA }

	public static SolicitudActualizacion crear(UUID pacienteId, Campo campo, String valorActual, String valorPropuesto) {
		if (valorPropuesto == null || valorPropuesto.isBlank()) {
			throw new IllegalArgumentException("El valor propuesto es obligatorio");
		}
		return new SolicitudActualizacion(UUID.randomUUID(), pacienteId, campo, valorActual, valorPropuesto.strip(), Estado.PENDIENTE,
				null, Instant.now(), null, null);
	}

	public SolicitudActualizacion aprobar(String usuario) {
		exigirPendiente();
		return new SolicitudActualizacion(id, pacienteId, campo, valorActual, valorPropuesto, Estado.APROBADA, null, solicitadaEn,
				Instant.now(), usuario);
	}

	public SolicitudActualizacion rechazar(String usuario, String motivo) {
		exigirPendiente();
		return new SolicitudActualizacion(id, pacienteId, campo, valorActual, valorPropuesto, Estado.RECHAZADA, motivo, solicitadaEn,
				Instant.now(), usuario);
	}

	private void exigirPendiente() {
		if (estado != Estado.PENDIENTE) {
			throw new ReglaNegocioException("SOLICITUD_YA_RESUELTA", "La solicitud ya fue " + estado.name().toLowerCase());
		}
	}
}
