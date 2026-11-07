package com.sigec.ms4_historias.infrastructure.adapter.in.web;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;

import com.sigec.ms4_historias.domain.exception.AccesoDenegadoException;
import com.sigec.ms4_historias.domain.exception.ConflictoException;
import com.sigec.ms4_historias.domain.exception.CursorInvalidoException;
import com.sigec.ms4_historias.domain.exception.DominioException;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.exception.ReglaNegocioException;
import com.sigec.ms4_historias.domain.exception.VersionConflictoException;
import com.sigec.ms4_historias.infrastructure.adapter.in.web.problem.ProblemaBase;

import jakarta.servlet.http.HttpServletRequest;

/** Casos de dominio de MS4 -> problem+json con {@code code} estable. Lo generico vive en {@link ProblemaBase}. */
@RestControllerAdvice
public class ApiExceptionHandler extends ProblemaBase {

	@ExceptionHandler(DominioException.class)
	ResponseEntity<ProblemDetail> dominio(DominioException ex, HttpServletRequest req) {
		HttpStatus status = ex instanceof RecursoNoEncontradoException ? HttpStatus.NOT_FOUND
				: ex instanceof ConflictoException || ex instanceof VersionConflictoException ? HttpStatus.CONFLICT
				: ex instanceof AccesoDenegadoException ? HttpStatus.FORBIDDEN
				: ex instanceof CursorInvalidoException ? HttpStatus.BAD_REQUEST
				: HttpStatus.UNPROCESSABLE_CONTENT;
		ProblemDetail pd = problema(status, ex.code(), titulo(status), ex.getMessage());
		ResponseEntity.BodyBuilder b = ResponseEntity.status(status);
		if (ex instanceof VersionConflictoException v) {
			pd.setProperty("versionVigente", v.versionVigente());
			b.eTag("\"" + v.versionVigente() + "\"");
		}
		completar(pd, new ServletWebRequest(req));
		return b.body(pd);
	}

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ProblemDetail> api(ApiException ex, HttpServletRequest req) {
		return responder(problema(ex.status(), ex.code(), titulo(ex.status()), ex.getMessage()), req);
	}

	/** limite fuera de rango, etc. (validacion de parametros). */
	@ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
	ResponseEntity<ProblemDetail> parametros(jakarta.validation.ConstraintViolationException ex, HttpServletRequest req) {
		ProblemDetail pd = problema(HttpStatus.BAD_REQUEST, "VALIDACION", "Solicitud invalida", "Hay parametros que no cumplen las reglas");
		pd.setProperty("errors", ex.getConstraintViolations().stream()
				.map(v -> java.util.Map.of("campo", v.getPropertyPath().toString().replaceAll("^.*\\.", ""), "mensaje", v.getMessage())).toList());
		return responder(pd, req);
	}

	/** Carrera entre dos escrituras que la base detecta (UNIQUE): conflicto, no 500. */
	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<ProblemDetail> integridad(DataIntegrityViolationException ex, HttpServletRequest req) {
		return responder(problema(HttpStatus.CONFLICT, "CONFLICTO", "Conflicto", "El dato ya existe o entra en conflicto con otro"), req);
	}

	private ResponseEntity<ProblemDetail> responder(ProblemDetail pd, HttpServletRequest req) {
		completar(pd, new ServletWebRequest(req));
		return ResponseEntity.status(pd.getStatus()).body(pd);
	}

	private static String titulo(HttpStatus s) {
		return switch (s) {
			case NOT_FOUND -> "No encontrado";
			case CONFLICT -> "Conflicto";
			case FORBIDDEN -> "Acceso denegado";
			case UNPROCESSABLE_CONTENT -> "Regla de negocio incumplida";
			case BAD_REQUEST -> "Solicitud invalida";
			default -> s.getReasonPhrase();
		};
	}
}
