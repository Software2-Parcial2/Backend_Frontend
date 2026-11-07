package com.sigec.ms4_historias.infrastructure.idempotency;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

/**
 * Aplica contracts/idempotency.md a POST/PUT/PATCH bajo /api/**. Se registra en la cadena de seguridad DESPUES de la
 * autorizacion, asi que solo reserva claves de usuarios autenticados y autorizados.
 */
public class IdempotencyFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(IdempotencyFilter.class);
	private static final Set<String> METHODS = Set.of("POST", "PUT", "PATCH");
	private static final Pattern UUID = Pattern
			.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
	private static final String PROBLEM = "application/problem+json";

	private final IdempotencyStore store;
	private final ObjectMapper mapper;
	private final Duration ttl;

	public IdempotencyFilter(IdempotencyStore store, ObjectMapper mapper, Duration ttl) {
		this.store = store;
		this.mapper = mapper;
		this.ttl = ttl;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !METHODS.contains(request.getMethod()) || !request.getRequestURI().startsWith("/api/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String header = request.getHeader("Idempotency-Key");
		if (header == null || header.isBlank()) {
			problem(response, 400, "Idempotency-Key requerida", "Falta la cabecera Idempotency-Key", null);
			return;
		}
		if (!UUID.matcher(header).matches()) {
			problem(response, 400, "Idempotency-Key requerida", "Idempotency-Key debe ser un UUID", null);
			return;
		}

		byte[] body = request.getInputStream().readAllBytes();
		String hash = requestHash(request, body);
		String key = scope() + ":" + header.toLowerCase();
		Instant now = Instant.now();

		boolean reserved = store.reserve(key, hash, now, now.plus(ttl));
		if (!reserved) {
			var existing = store.find(key);
			if (existing.isEmpty()) { // se libero entre medias: se reintenta una vez
				reserved = store.reserve(key, hash, now, now.plus(ttl));
			} else {
				var rec = existing.get();
				if (!rec.requestHash().equals(hash)) {
					problem(response, 422, "Idempotency-Key reutilizada",
							"La misma clave se uso con una peticion distinta", null);
				} else if (rec.completado()) {
					replay(response, rec);
				} else {
					problem(response, 409, "Peticion en proceso", "La peticion original sigue procesandose", "1");
				}
				return;
			}
			if (!reserved) {
				problem(response, 409, "Peticion en proceso", "La peticion original sigue procesandose", "1");
				return;
			}
		}

		ContentCachingResponseWrapper wrapper = new ContentCachingResponseWrapper(response);
		try {
			chain.doFilter(new CachedBodyRequest(request, body), wrapper);
			int status = wrapper.getStatus();
			if (status >= 500) {
				store.release(key); // error transitorio: la clave se puede reintentar
			} else {
				store.complete(key, status, wrapper.getContentAsByteArray(), wrapper.getContentType());
			}
		} catch (IOException | ServletException | RuntimeException e) {
			store.release(key);
			throw e;
		}
		wrapper.copyBodyToResponse();
	}

	private void replay(HttpServletResponse response, IdempotencyStore.Record rec) throws IOException {
		response.setStatus(rec.statusCode());
		if (rec.contentType() != null) {
			response.setContentType(rec.contentType());
		}
		response.setHeader("Idempotent-Replay", "true");
		if (rec.responseBody() != null) {
			response.getOutputStream().write(rec.responseBody());
		}
	}

	private void problem(HttpServletResponse response, int status, String title, String detail, String retryAfter)
			throws IOException {
		response.setStatus(status);
		response.setContentType(PROBLEM);
		if (retryAfter != null) {
			response.setHeader("Retry-After", retryAfter);
		}
		String code = status == 400 ? "IDEMPOTENCY_KEY_INVALIDA" : status == 422 ? "IDEMPOTENCY_KEY_REUTILIZADA" : "PETICION_EN_PROCESO";
		String json = mapper.writeValueAsString(Map.of("type", "about:blank", "title", title, "status", status, "detail", detail, "code", code));
		response.getOutputStream().write(json.getBytes(StandardCharsets.UTF_8));
	}

	/** Usuario autenticado (sub del JWT) para acotar la clave. */
	private String scope() {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		return auth != null && auth.getName() != null ? auth.getName() : "anon";
	}

	/** SHA-256(METHOD + " " + rutaConQuery + "\n" + SHA-256(cuerpo canonico)). */
	String requestHash(HttpServletRequest request, byte[] body) {
		String path = request.getRequestURI() + (request.getQueryString() != null ? "?" + request.getQueryString() : "");
		return sha256(request.getMethod() + " " + path + "\n" + sha256(canonicalBody(body)));
	}

	private String canonicalBody(byte[] body) {
		if (body.length == 0) {
			return "{}";
		}
		try {
			return mapper.writeValueAsString(sortKeys(mapper.readValue(body, Object.class)));
		} catch (RuntimeException e) {
			log.debug("Cuerpo no JSON, se usa tal cual para la huella");
			return new String(body, StandardCharsets.UTF_8);
		}
	}

	@SuppressWarnings("unchecked")
	private Object sortKeys(Object value) {
		if (value instanceof Map<?, ?> map) {
			Map<String, Object> sorted = new TreeMap<>();
			((Map<String, Object>) map).forEach((k, v) -> sorted.put(k, sortKeys(v)));
			return sorted;
		}
		if (value instanceof List<?> list) {
			return list.stream().map(this::sortKeys).toList();
		}
		return value;
	}

	private static String sha256(String text) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
