package com.sigec.ms4_historias.infrastructure.adapter.out.messaging;

import java.sql.Timestamp;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.sigec.ms4_historias.application.port.out.EventPublisherPort;
import com.sigec.ms4_historias.domain.event.DomainEvent;

import tools.jackson.databind.ObjectMapper;

/** Patron Outbox: el evento se guarda en la misma transaccion que el cambio; el relay lo publica despues. */
@Component
public class OutboxEventPublisher implements EventPublisherPort {

	private final JdbcTemplate jdbc;
	private final ObjectMapper mapper;

	public OutboxEventPublisher(JdbcTemplate jdbc, ObjectMapper mapper) {
		this.jdbc = jdbc;
		this.mapper = mapper;
	}

	@Override
	public void publicar(DomainEvent event) {
		jdbc.update("INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?::jsonb, ?)",
				UUID.randomUUID(), event.aggregateType(), event.aggregateId(), event.eventType(), mapper.writeValueAsString(event),
				Timestamp.from(event.occurredAt()));
	}
}
