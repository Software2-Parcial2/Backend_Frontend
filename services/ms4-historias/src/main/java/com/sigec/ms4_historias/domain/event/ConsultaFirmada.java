package com.sigec.ms4_historias.domain.event;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.Consulta;

/** Sin contenido clinico: solo ids (contracts/events/consulta.firmada.schema.json). */
public record ConsultaFirmada(UUID consultaId, UUID historiaId, UUID pacienteId, UUID medicoId, UUID citaId, Instant firmadaEn,
		Instant occurredAt) implements DomainEvent {

	public static ConsultaFirmada de(Consulta c, UUID pacienteId) {
		return new ConsultaFirmada(c.id(), c.historiaId(), pacienteId, c.medicoId(), c.citaId(), c.firmadaEn(), c.firmadaEn());
	}

	@Override
	public String aggregateType() {
		return "Consulta";
	}

	@Override
	public UUID aggregateId() {
		return consultaId;
	}

	@Override
	public String eventType() {
		return "consulta.firmada";
	}
}
