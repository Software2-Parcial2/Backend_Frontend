package com.sigec.ms2_pacientes.infrastructure.adapter.in.web.problem;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

/** 401 y 403 de Spring Security como {@code application/problem+json}, con el mismo formato que el resto de errores. */
public final class ProblemJsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

	private final ObjectMapper mapper;

	public ProblemJsonSecurityHandlers(ObjectMapper mapper) {
		this.mapper = mapper;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) throws IOException {
		response.setHeader("WWW-Authenticate", "Bearer");
		escribir(request, response, 401, "No autenticado", "Falta un token valido", "NO_AUTENTICADO");
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws IOException {
		escribir(request, response, 403, "Acceso denegado", "Su rol no permite esta operacion", "PROHIBIDO");
	}

	private void escribir(HttpServletRequest request, HttpServletResponse response, int status, String title, String detail, String code)
			throws IOException {
		Map<String, Object> cuerpo = new LinkedHashMap<>();
		cuerpo.put("type", "about:blank");
		cuerpo.put("title", title);
		cuerpo.put("status", status);
		cuerpo.put("detail", detail);
		cuerpo.put("code", code);
		cuerpo.put("instance", request.getRequestURI());
		String correlation = request.getHeader(CorrelationFilter.HEADER);
		if (correlation != null) cuerpo.put("correlationId", correlation);
		response.setStatus(status);
		response.setContentType("application/problem+json");
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.getOutputStream().write(mapper.writeValueAsBytes(cuerpo));
	}
}
