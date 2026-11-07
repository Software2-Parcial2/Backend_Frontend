package com.sigec.ms4_historias.application.port.out;

import java.util.Optional;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.Historia;

public interface HistoriaRepositoryPort {

	Optional<Historia> porId(UUID id);

	Optional<Historia> porPacienteId(UUID pacienteId);

	/** Crea la historia del paciente; si ya existe actualiza su identificacion (idempotente). */
	void guardarIdentificacion(UUID pacienteId, String numeroHistoria, String nombre);
}
