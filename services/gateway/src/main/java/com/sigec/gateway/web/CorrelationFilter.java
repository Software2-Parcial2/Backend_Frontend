package com.sigec.gateway.web;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.Set;
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
 * Origen de {@code X-Correlation-Id}: si la peticion no lo trae lo crea, lo reenvia a los servicios (el gateway copia las
 * cabeceras de la peticion) y lo devuelve en la respuesta, incluidos los 401/403. Va antes de Spring Security.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Correlation-Id";

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String entrante = request.getHeader(HEADER);
		boolean falta = entrante == null || entrante.isBlank();
		String id = falta ? UUID.randomUUID().toString() : entrante;
		response.setHeader(HEADER, id);
		chain.doFilter(falta ? new ConCorrelacion(request, id) : request, response);
	}

	/** Peticion con la cabecera de correlacion presente en getHeader/getHeaders/getHeaderNames. */
	private static final class ConCorrelacion extends HttpServletRequestWrapper {
		private final String id;

		ConCorrelacion(HttpServletRequest request, String id) {
			super(request);
			this.id = id;
		}

		@Override
		public String getHeader(String name) {
			return HEADER.equalsIgnoreCase(name) ? id : super.getHeader(name);
		}

		@Override
		public Enumeration<String> getHeaders(String name) {
			return HEADER.equalsIgnoreCase(name) ? Collections.enumeration(Set.of(id)) : super.getHeaders(name);
		}

		@Override
		public Enumeration<String> getHeaderNames() {
			Set<String> nombres = new LinkedHashSet<>(Collections.list(super.getHeaderNames()));
			nombres.add(HEADER);
			return Collections.enumeration(nombres);
		}
	}
}
