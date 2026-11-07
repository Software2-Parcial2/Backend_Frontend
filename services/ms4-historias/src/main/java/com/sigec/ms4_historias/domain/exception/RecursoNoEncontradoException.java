package com.sigec.ms4_historias.domain.exception;

/** Error de negocio con estado HTTP 404. */
public class RecursoNoEncontradoException extends DominioException {

	public RecursoNoEncontradoException(String code, String message) {
		super(code, message);
	}
}
