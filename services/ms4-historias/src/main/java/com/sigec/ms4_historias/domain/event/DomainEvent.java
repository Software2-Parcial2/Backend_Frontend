package com.sigec.ms4_historias.domain.event;

import java.time.Instant;
import java.util.UUID;

public interface DomainEvent {

	String aggregateType();

	UUID aggregateId();

	String eventType();

	Instant occurredAt();
}
