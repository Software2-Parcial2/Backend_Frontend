package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

public record Consentimiento(UUID id, UUID pacienteId, TipoConsentimiento tipo, String versionTexto, Instant otorgadoEn, Instant revocadoEn) {

	public boolean vigente() {
		return revocadoEn == null;
	}
}
