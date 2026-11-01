package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.sigec.ms2_pacientes.domain.exception.PacienteDuplicadoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;

@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(PacienteNoEncontradoException.class)
	ProblemDetail noEncontrado(PacienteNoEncontradoException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	@ExceptionHandler(PacienteDuplicadoException.class)
	ProblemDetail duplicado(PacienteDuplicadoException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ProblemDetail invalido(IllegalArgumentException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
	}
}
