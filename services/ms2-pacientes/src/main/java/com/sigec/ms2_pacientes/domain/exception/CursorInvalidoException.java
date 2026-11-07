package com.sigec.ms2_pacientes.domain.exception;

/** 400 CURSOR_INVALIDO. */
public class CursorInvalidoException extends DominioException {

	public CursorInvalidoException() {
		super("CURSOR_INVALIDO", "El cursor no es valido");
	}
}
