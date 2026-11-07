package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

public record Historia(UUID id, UUID pacienteId, String numeroHistoria, String pacienteNombre, Instant creada, long version) {
}
