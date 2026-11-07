package com.sigec.ms4_historias.domain.exception;

/** Error de negocio con estado HTTP 409. */
public class ConflictoException extends DominioException {

	public ConflictoException(String code, String message) {
		super(code, message);
	}
}
