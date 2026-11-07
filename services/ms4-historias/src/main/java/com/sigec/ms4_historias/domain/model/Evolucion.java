package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

/** Nota de evolucion: inmutable (la base rechaza UPDATE y DELETE). */
public record Evolucion(UUID id, UUID consultaId, UUID medicoId, Instant fecha, String nota) {
}
