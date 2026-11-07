package com.sigec.ms4_historias.domain.exception;

/** Base de los errores de negocio: llevan un {@code code} estable que el adaptador web traduce a problem+json. */
public abstract class DominioException extends RuntimeException {

	private final String code;

	protected DominioException(String code, String message) {
		super(message);
		this.code = code;
	}

	public String code() {
		return code;
	}
}
