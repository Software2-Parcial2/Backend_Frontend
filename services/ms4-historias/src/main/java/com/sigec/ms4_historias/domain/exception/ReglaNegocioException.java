package com.sigec.ms4_historias.domain.exception;

/** Error de negocio con estado HTTP 422. */
public class ReglaNegocioException extends DominioException {

	public ReglaNegocioException(String code, String message) {
		super(code, message);
	}
}
