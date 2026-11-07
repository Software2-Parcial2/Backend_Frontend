package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import org.springframework.http.HttpStatus;

/** Error de la capa web (cabeceras mal formadas, etc.) con code estable. */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}
}
