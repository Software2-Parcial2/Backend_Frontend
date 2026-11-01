package com.sigec.ms2_pacientes.infrastructure.adapter.out.messaging;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.sigec.ms2_pacientes.infrastructure.config.RabbitTopologyConfig;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Relay del patron Outbox: publica al menos una vez los eventos con published_at NULL.
 *
 * <ul>
 * <li>Lee un lote con {@code FOR UPDATE SKIP LOCKED}: varias instancias pueden correr sin pisarse.</li>
 * <li>Publica en {@code sigec.eventos} con publisher confirms y solo entonces marca {@code published_at}.</li>
 * <li>El {@code id} del sobre es el id de la fila: si el proceso muere entre publicar y marcar, la reentrega lleva el
 * mismo id y el consumidor la descarta (dedupe por id).</li>
 * <li>Ante un fallo (p. ej. RabbitMQ caido) se detiene el lote para conservar el orden y reintenta con backoff
 * exponencial (1 s ... 30 s).</li>
 * </ul>
 */
@Component
public class OutboxRelay {

	private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
	private static final long CONFIRM_TIMEOUT_MS = 5_000;
	private static final long MAX_BACKOFF_MS = 30_000;

	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final RabbitTemplate rabbit;
	private final ObjectMapper mapper;
	private final int batchSize;

	private int consecutiveFailures = 0;
	private long nextAttemptAt = 0;

	public OutboxRelay(JdbcTemplate jdbc, TransactionTemplate tx, RabbitTemplate rabbit, ObjectMapper mapper,
			@Value("${sigec.outbox.batch-size:50}") int batchSize) {
		this.jdbc = jdbc;
		this.tx = tx;
		this.rabbit = rabbit;
		this.mapper = mapper;
		this.batchSize = batchSize;
	}

	@Scheduled(fixedDelayString = "${sigec.outbox.interval-ms:1000}")
	public void tick() {
		if (System.currentTimeMillis() < nextAttemptAt) {
			return; // en backoff
		}
		try {
			int published = relayBatch();
			if (published > 0) {
				log.info("outbox: publicados={} pendientes={}", published,
						jdbc.queryForObject("SELECT count(*) FROM outbox WHERE published_at IS NULL", Long.class));
			}
			consecutiveFailures = 0;
		} catch (RuntimeException e) {
			consecutiveFailures++;
			long backoff = Math.min(MAX_BACKOFF_MS, 1_000L << Math.min(consecutiveFailures - 1, 5));
			nextAttemptAt = System.currentTimeMillis() + backoff;
			log.warn("outbox: fallo al publicar ({}); reintento en {} ms [fallos seguidos={}]", e.getMessage(), backoff,
					consecutiveFailures);
		}
	}

	/** Procesa un lote; devuelve cuantos eventos publico. Visible para pruebas. */
	public int relayBatch() {
		Integer published = tx.execute(status -> {
			List<Row> rows = jdbc.query("""
					SELECT id, aggregate_id, event_type, payload::text AS payload, created_at
					  FROM outbox WHERE published_at IS NULL
					 ORDER BY created_at, id
					 LIMIT ? FOR UPDATE SKIP LOCKED
					""", (rs, i) -> new Row((UUID) rs.getObject("id"), (UUID) rs.getObject("aggregate_id"),
					rs.getString("event_type"), rs.getString("payload"), rs.getTimestamp("created_at").toInstant()),
					batchSize);
			int count = 0;
			for (Row row : rows) {
				publish(row);
				jdbc.update("UPDATE outbox SET published_at = ? WHERE id = ?", Timestamp.from(Instant.now()), row.id());
				count++;
			}
			return count;
		});
		return published == null ? 0 : published;
	}

	private void publish(Row row) {
		Message message = MessageBuilder.withBody(envelope(row).getBytes(StandardCharsets.UTF_8))
				.setContentType(MessageProperties.CONTENT_TYPE_JSON)
				.setDeliveryMode(MessageDeliveryMode.PERSISTENT)
				.setMessageId(row.id().toString())
				.setType(row.eventType())
				.setCorrelationId(row.aggregateId().toString())
				.build();
		// invoke(): un canal dedicado, para poder esperar la confirmacion del broker de este envio.
		rabbit.invoke(ops -> {
			ops.send(RabbitTopologyConfig.EXCHANGE_EVENTOS, row.eventType(), message);
			ops.waitForConfirmsOrDie(CONFIRM_TIMEOUT_MS);
			return null;
		});
	}

	/** Sobre comun (contracts/events/envelope.schema.json). occurredAt va en el sobre, no en el payload. */
	private String envelope(Row row) {
		JsonNode payload = mapper.readTree(row.payload());
		if (payload instanceof ObjectNode obj) {
			obj.remove("occurredAt");
		}
		ObjectNode env = mapper.createObjectNode();
		env.put("id", row.id().toString());
		env.put("type", row.eventType());
		env.put("occurredAt", row.createdAt().toString());
		env.put("correlationId", row.aggregateId().toString());
		env.putNull("causationId");
		env.put("version", 1);
		env.set("payload", payload);
		return mapper.writeValueAsString(env);
	}

	private record Row(UUID id, UUID aggregateId, String eventType, String payload, Instant createdAt) {
	}
}
