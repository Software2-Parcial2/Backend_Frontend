package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

/** Traza de un acceso: solo ids y accion, nunca contenido clinico. */
public record AccesoAuditado(long id, UUID pacienteId, UUID historiaId, String usuarioId, String rol, Accion accion, String recurso,
		Instant ocurridoEn) {
}
