package com.sigec.ms2_pacientes.domain.exception;

public class PacienteDuplicadoException extends ConflictoException {

	public PacienteDuplicadoException(String documento) {
		super("PACIENTE_DUPLICADO", "Ya existe un paciente con el documento " + documento);
	}
}
