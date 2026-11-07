package com.sigec.ms2_pacientes.domain.event;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.domain.model.Medico;

public record MedicoActualizado(UUID medicoId, String nombre, String especialidad, String especialidadNombre, String consultorio, boolean activo,
		String usuarioKeycloak, Instant occurredAt) implements DomainEvent {

	public static MedicoActualizado de(Medico m, Especialidad e) {
		return new MedicoActualizado(m.id(), m.nombre(), e.codigo(), e.nombre(), m.consultorio(), m.activo(), m.usuarioKeycloak(), Instant.now());
	}

	@Override
	public String aggregateType() {
		return "Medico";
	}

	@Override
	public UUID aggregateId() {
		return medicoId;
	}

	@Override
	public String eventType() {
		return "medico.actualizado";
	}
}
