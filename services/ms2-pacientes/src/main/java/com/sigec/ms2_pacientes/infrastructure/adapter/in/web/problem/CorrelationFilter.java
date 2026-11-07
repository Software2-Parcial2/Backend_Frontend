package com.sigec.ms2_pacientes.infrastructure.adapter.in.web.problem;

import java.io.IOException;
import java.util.UUID;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Garantiza {@code X-Correlation-Id}: usa el de la peticion (lo genera el gateway) o crea uno, lo expone al resto de la
 * cadena como cabecera de la peticion y lo devuelve en la respuesta. Va primero para que tambien lo vean los errores 401/403.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Correlation-Id";

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String entrante = request.getHeader(HEADER);
		String id = entrante == null || entrante.isBlank() ? UUID.randomUUID().toString() : entrante;
		response.setHeader(HEADER, id);
		chain.doFilter(entrante == null || entrante.isBlank() ? new Conid(request, id) : request, response);
	}

	/** Peticion con la cabecera de correlacion ya resuelta. */
	private static final class Conid extends HttpServletRequestWrapper {
		private final String id;

		Conid(HttpServletRequest request, String id) {
			super(request);
			this.id = id;
		}

		@Override
		public String getHeader(String name) {
			return HEADER.equalsIgnoreCase(name) ? id : super.getHeader(name);
		}
	}
}
