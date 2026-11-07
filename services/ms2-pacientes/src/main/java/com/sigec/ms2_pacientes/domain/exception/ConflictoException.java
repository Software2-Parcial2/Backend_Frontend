package com.sigec.ms2_pacientes.domain.exception;

/** 409: el estado actual impide la operacion (duplicados, etc.). */
public class ConflictoException extends DominioException {

	public ConflictoException(String code, String message) {
		super(code, message);
	}
}
