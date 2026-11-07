package com.sigec.ms2_pacientes.domain.exception;

/** 422: la peticion es valida pero incumple una regla de negocio. */
public class ReglaNegocioException extends DominioException {

	public ReglaNegocioException(String code, String message) {
		super(code, message);
	}
}
