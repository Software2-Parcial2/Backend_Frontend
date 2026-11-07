package com.sigec.ms4_historias.domain.exception;

/** 403: el rol puede usar el endpoint pero no esta permitido sobre este recurso. */
public class AccesoDenegadoException extends DominioException {

	public AccesoDenegadoException(String code, String message) {
		super(code, message);
	}
}
