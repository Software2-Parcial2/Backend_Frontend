package com.sigec.ms2_pacientes.domain.exception;

public class PacienteDuplicadoException extends RuntimeException {

	public PacienteDuplicadoException(String documento) {
		super("Ya existe un paciente con el documento " + documento);
	}
}
