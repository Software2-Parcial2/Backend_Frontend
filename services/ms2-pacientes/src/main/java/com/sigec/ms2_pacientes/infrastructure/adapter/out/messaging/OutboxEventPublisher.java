package com.sigec.ms2_pacientes.infrastructure.adapter.out.messaging;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.domain.event.DomainEvent;
import com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence.OutboxEntity;
import com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence.OutboxJpaRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * Patron Outbox: el evento se guarda en la misma transaccion que el cambio de
 * negocio. Un relay posterior lo publicara en RabbitMQ y marcara published_at.
 */
@Component
public class OutboxEventPublisher implements EventPublisherPort {

	private final OutboxJpaRepository outbox;
	private final ObjectMapper objectMapper;

	public OutboxEventPublisher(OutboxJpaRepository outbox, ObjectMapper objectMapper) {
		this.outbox = outbox;
		this.objectMapper = objectMapper;
	}

	@Override
	public void publicar(DomainEvent event) {
		OutboxEntity row = new OutboxEntity();
		row.setId(UUID.randomUUID());
		row.setAggregateType(event.aggregateType());
		row.setAggregateId(event.aggregateId());
		row.setEventType(event.eventType());
		row.setPayload(objectMapper.writeValueAsString(event));
		row.setCreatedAt(event.occurredAt());
		outbox.save(row);
	}
}
