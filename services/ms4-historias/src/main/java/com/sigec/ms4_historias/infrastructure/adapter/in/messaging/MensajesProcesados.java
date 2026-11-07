package com.sigec.ms4_historias.infrastructure.adapter.in.messaging;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Deduplicacion de consumidores por id de mensaje (contracts/idempotency.md): arrendamiento de 60 s y COMPLETADO 7 dias. */
@Component
public class MensajesProcesados {

	private final JdbcTemplate jdbc;

	public MensajesProcesados(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** true si este consumidor debe procesar el mensaje (nuevo, o su arrendamiento anterior vencio). */
	public boolean reservar(UUID id) {
		return jdbc.update("""
				INSERT INTO processed_messages (id, status, locked_until, expires_at)
				VALUES (?, 'PROCESANDO', now() + interval '60 seconds', now() + interval '7 days')
				ON CONFLICT (id) DO UPDATE SET locked_until = now() + interval '60 seconds'
				 WHERE processed_messages.status = 'PROCESANDO' AND processed_messages.locked_until < now()
				""", id) == 1;
	}

	public void completar(UUID id) {
		jdbc.update("UPDATE processed_messages SET status = 'COMPLETADO', locked_until = NULL WHERE id = ?", id);
	}

	public void liberar(UUID id) {
		jdbc.update("DELETE FROM processed_messages WHERE id = ? AND status = 'PROCESANDO'", id);
	}
}
