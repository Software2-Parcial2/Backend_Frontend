package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

/** Lo que MS4 sabe de una cita de MS3 (por eventos). */
public record CitaProyectada(UUID citaId, UUID pacienteId, UUID medicoId, Instant fechaHora, String estado) {

	/** Se puede atender si esta confirmada o el paciente ya llego/fue atendido. */
	public boolean habilitaConsulta() {
		return "CONFIRMADA".equals(estado) || "LLEGO".equals(estado) || "ATENDIDA".equals(estado);
	}
}
