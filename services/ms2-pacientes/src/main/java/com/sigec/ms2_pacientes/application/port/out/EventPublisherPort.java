package com.sigec.ms2_pacientes.application.port.out;

import com.sigec.ms2_pacientes.domain.event.DomainEvent;

/** Publica eventos de dominio (la implementacion los escribe en la tabla outbox). */
public interface EventPublisherPort {

	void publicar(DomainEvent event);
}
