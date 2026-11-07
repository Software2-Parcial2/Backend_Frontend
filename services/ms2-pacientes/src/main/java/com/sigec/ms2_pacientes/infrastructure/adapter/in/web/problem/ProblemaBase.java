package com.sigec.ms2_pacientes.infrastructure.adapter.in.web.problem;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Errores de SIGEC como RFC 7807 ({@code type, title, status, detail, code, errors?, instance, correlationId}).
 * Los casos de dominio extienden esta clase y llaman a {@link #problema}. Ver docs/api.md.
 */
public abstract class ProblemaBase extends ResponseEntityExceptionHandler {

	/** Crea un problema con {@code code} estable (p. ej. PACIENTE_DUPLICADO). */
	protected ProblemDetail problema(HttpStatus status, String code, String titulo, String detalle) {
		ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detalle);
		p.setTitle(titulo);
		p.setProperty("code", code);
		return p;
	}

	/** 400/404/405... de Spring MVC: se completa con code, instance y correlationId. */
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers, HttpStatusCode status,
			WebRequest request) {
		ResponseEntity<Object> r = super.handleExceptionInternal(ex, body, headers, status, request);
		if (r != null && r.getBody() instanceof ProblemDetail pd) completar(pd, request);
		return r;
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
			HttpStatusCode status, WebRequest request) {
		ProblemDetail pd = problema(HttpStatus.BAD_REQUEST, "VALIDACION", "Solicitud invalida", "Hay campos que no cumplen las reglas");
		List<Map<String, String>> errores = ex.getBindingResult().getFieldErrors().stream()
				.map(f -> Map.of("campo", f.getField(), "mensaje", String.valueOf(f.getDefaultMessage())))
				.toList();
		pd.setProperty("errors", errores);
		completar(pd, request);
		return ResponseEntity.badRequest().headers(headers).body(pd);
	}

	/** Validacion de parametros (limite fuera de rango, etc.): 400 VALIDACION con errors por parametro. */
	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(org.springframework.web.method.annotation.HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		ProblemDetail pd = problema(HttpStatus.BAD_REQUEST, "VALIDACION", "Solicitud invalida", "Hay parametros que no cumplen las reglas");
		List<Map<String, String>> errores = ex.getParameterValidationResults().stream()
				.flatMap(r -> r.getResolvableErrors().stream().map(e -> Map.of("campo", r.getMethodParameter().getParameterName() == null ? "" : r.getMethodParameter().getParameterName(),
						"mensaje", String.valueOf(e.getDefaultMessage()))))
				.toList();
		pd.setProperty("errors", errores);
		completar(pd, request);
		return ResponseEntity.badRequest().headers(headers).body(pd);
	}

	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ProblemDetail> prohibido(AccessDeniedException ex, HttpServletRequest req) {
		ProblemDetail pd = problema(HttpStatus.FORBIDDEN, "PROHIBIDO", "Acceso denegado", "Su rol no permite esta operacion");
		completar(pd, new ServletWebRequest(req));
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(pd);
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ProblemDetail> inesperado(Exception ex, HttpServletRequest req) {
		logger.error("Error no controlado en " + req.getRequestURI(), ex);
		ProblemDetail pd = problema(HttpStatus.INTERNAL_SERVER_ERROR, "ERROR_INTERNO", "Error interno", "Ocurrio un error inesperado");
		completar(pd, new ServletWebRequest(req));
		return ResponseEntity.internalServerError().body(pd);
	}

	/** Anade code (si falta), instance y correlationId. */
	protected void completar(ProblemDetail pd, WebRequest request) {
		if (pd.getProperties() == null || !pd.getProperties().containsKey("code")) {
			pd.setProperty("code", codigoPorEstado(pd.getStatus()));
		}
		if (request instanceof ServletWebRequest sw) {
			HttpServletRequest http = sw.getRequest();
			pd.setInstance(java.net.URI.create(http.getRequestURI()));
			String id = http.getHeader(CorrelationFilter.HEADER);
			if (id != null) pd.setProperty("correlationId", id);
		}
	}

	protected static String codigoPorEstado(int status) {
		return switch (status) {
			case 400 -> "SOLICITUD_INVALIDA";
			case 401 -> "NO_AUTENTICADO";
			case 403 -> "PROHIBIDO";
			case 404 -> "NO_ENCONTRADO";
			case 405 -> "METODO_NO_PERMITIDO";
			case 409 -> "CONFLICTO";
			case 415 -> "TIPO_NO_SOPORTADO";
			case 422 -> "REGLA_DE_NEGOCIO";
			default -> status >= 500 ? "ERROR_INTERNO" : "ERROR";
		};
	}
}
