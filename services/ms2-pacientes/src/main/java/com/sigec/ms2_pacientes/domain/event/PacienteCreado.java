package com.sigec.ms2_pacientes.domain.event;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Paciente;

public record PacienteCreado(UUID pacienteId, String numeroHistoria, String nombre, String documento, String email, Instant occurredAt)
		implements DomainEvent {

	public static PacienteCreado de(Paciente paciente) {
		return new PacienteCreado(paciente.id(), paciente.numeroHistoria(), paciente.nombre(), paciente.documento(), paciente.email(),
				Instant.now());
	}

	@Override
	public String aggregateType() {
		return "Paciente";
	}

	@Override
	public UUID aggregateId() {
		return pacienteId;
	}

	@Override
	public String eventType() {
		return "paciente.creado";
	}
}
