package com.sigec.ms2_pacientes.domain.exception;

import java.util.UUID;

public class PacienteNoEncontradoException extends RecursoNoEncontradoException {

	public PacienteNoEncontradoException(UUID id) {
		super("PACIENTE_NO_ENCONTRADO", "No existe el paciente " + id);
	}
}
