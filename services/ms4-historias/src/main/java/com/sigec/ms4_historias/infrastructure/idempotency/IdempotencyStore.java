package com.sigec.ms4_historias.infrastructure.idempotency;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Almacen de claves de idempotencia en PostgreSQL. Cada operacion es su propia transaccion (autocommit) para que
 * otras peticiones vean enseguida la reserva PROCESANDO.
 */
@Component
public class IdempotencyStore {

	public record Record(String key, String requestHash, String status, Integer statusCode, byte[] responseBody,
			String contentType) {
		public boolean completado() {
			return "COMPLETADO".equals(status);
		}
	}

	private final JdbcTemplate jdbc;

	public IdempotencyStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Reserva atomica: inserta la clave, o toma una fila VENCIDA. Devuelve false si existe una vigente.
	 * (La condicion WHERE del DO UPDATE evita que dos peticiones reserven a la vez.)
	 */
	public boolean reserve(String key, String requestHash, Instant now, Instant expiresAt) {
		int rows = jdbc.update("""
				INSERT INTO idempotency_keys (key, request_hash, status, created_at, expires_at)
				VALUES (?, ?, 'PROCESANDO', ?, ?)
				ON CONFLICT (key) DO UPDATE
				   SET request_hash = EXCLUDED.request_hash, status = 'PROCESANDO', status_code = NULL,
				       response_body = NULL, content_type = NULL,
				       created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
				 WHERE idempotency_keys.expires_at < ?
				""", key, requestHash, Timestamp.from(now), Timestamp.from(expiresAt), Timestamp.from(now));
		return rows == 1;
	}

	public Optional<Record> find(String key) {
		return jdbc.query("""
				SELECT key, request_hash, status, status_code, response_body, content_type
				  FROM idempotency_keys WHERE key = ?
				""", (rs, i) -> new Record(rs.getString("key"), rs.getString("request_hash").strip(), rs.getString("status"),
				(Integer) rs.getObject("status_code"),
				rs.getString("response_body") == null ? null : rs.getString("response_body").getBytes(java.nio.charset.StandardCharsets.UTF_8),
				rs.getString("content_type")), key).stream().findFirst();
	}

	public void complete(String key, int statusCode, byte[] body, String contentType) {
		jdbc.update("""
				UPDATE idempotency_keys SET status = 'COMPLETADO', status_code = ?, response_body = ?, content_type = ?
				 WHERE key = ?
				""", statusCode, new String(body, java.nio.charset.StandardCharsets.UTF_8), contentType, key);
	}

	public void release(String key) {
		jdbc.update("DELETE FROM idempotency_keys WHERE key = ?", key);
	}
}
