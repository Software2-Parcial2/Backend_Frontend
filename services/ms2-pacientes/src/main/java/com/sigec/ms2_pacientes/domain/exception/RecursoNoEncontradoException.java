package com.sigec.ms2_pacientes.domain.exception;

/** 404. */
public class RecursoNoEncontradoException extends DominioException {

	public RecursoNoEncontradoException(String code, String message) {
		super(code, message);
	}
}
