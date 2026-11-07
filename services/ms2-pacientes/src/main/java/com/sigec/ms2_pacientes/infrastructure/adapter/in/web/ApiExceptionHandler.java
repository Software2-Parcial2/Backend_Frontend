package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;

import com.sigec.ms2_pacientes.domain.exception.PacienteDuplicadoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.problem.ProblemaBase;

import jakarta.servlet.http.HttpServletRequest;

/** Casos de dominio de MS2 -> problem+json con {@code code} estable. Lo generico vive en {@link ProblemaBase}. */
@RestControllerAdvice
public class ApiExceptionHandler extends ProblemaBase {

	@ExceptionHandler(PacienteNoEncontradoException.class)
	ResponseEntity<ProblemDetail> noEncontrado(PacienteNoEncontradoException ex, HttpServletRequest req) {
		return responder(problema(HttpStatus.NOT_FOUND, "PACIENTE_NO_ENCONTRADO", "Paciente no encontrado", ex.getMessage()), req);
	}

	@ExceptionHandler(PacienteDuplicadoException.class)
	ResponseEntity<ProblemDetail> duplicado(PacienteDuplicadoException ex, HttpServletRequest req) {
		return responder(problema(HttpStatus.CONFLICT, "PACIENTE_DUPLICADO", "Paciente duplicado", ex.getMessage()), req);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ProblemDetail> invalido(IllegalArgumentException ex, HttpServletRequest req) {
		return responder(problema(HttpStatus.BAD_REQUEST, "SOLICITUD_INVALIDA", "Solicitud invalida", ex.getMessage()), req);
	}

	private ResponseEntity<ProblemDetail> responder(ProblemDetail pd, HttpServletRequest req) {
		completar(pd, new ServletWebRequest(req));
		return ResponseEntity.status(pd.getStatus()).body(pd);
	}
}
