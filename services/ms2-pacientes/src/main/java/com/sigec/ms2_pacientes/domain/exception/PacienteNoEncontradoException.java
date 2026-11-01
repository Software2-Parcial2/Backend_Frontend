package com.sigec.ms2_pacientes.domain.exception;

import java.util.UUID;

public class PacienteNoEncontradoException extends RuntimeException {

	public PacienteNoEncontradoException(UUID id) {
		super("No existe el paciente " + id);
	}
}
