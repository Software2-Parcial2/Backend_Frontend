package com.sigec.ms4_historias.application.port.out;

import com.sigec.ms4_historias.domain.event.DomainEvent;

/** Publica eventos de dominio (la implementacion los escribe en la tabla outbox). */
public interface EventPublisherPort {

	void publicar(DomainEvent event);
}
