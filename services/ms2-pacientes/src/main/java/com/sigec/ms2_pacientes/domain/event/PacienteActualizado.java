package com.sigec.ms2_pacientes.domain.event;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Paciente;

/** Los datos del paciente cambiaron (edicion o solicitud aprobada). Lleva el estado completo vigente de lo que otros servicios proyectan. */
public record PacienteActualizado(UUID pacienteId, String numeroHistoria, String nombre, String documento, String email, String telefono,
		long version, Instant occurredAt) implements DomainEvent {

	public static PacienteActualizado de(Paciente p) {
		return new PacienteActualizado(p.id(), p.numeroHistoria(), p.nombre(), p.documento(), p.email(), p.telefono(),
				p.version() == null ? 0 : p.version(), Instant.now());
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
		return "paciente.actualizado";
	}
}
