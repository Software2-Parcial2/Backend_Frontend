package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms4_historias.domain.exception.ReglaNegocioException;

public record Antecedente(UUID id, UUID historiaId, TipoAntecedente tipo, String descripcion, boolean activo, Instant creado, long version) {

	public static Antecedente nuevo(UUID historiaId, TipoAntecedente tipo, String descripcion) {
		return new Antecedente(UUID.randomUUID(), historiaId, tipo, descripcionValida(descripcion), true, Instant.now(), 0);
	}

	public Antecedente editar(String descripcion, boolean activo) {
		return new Antecedente(id, historiaId, tipo, descripcionValida(descripcion), activo, creado, version);
	}

	private static String descripcionValida(String d) {
		if (d == null || d.isBlank()) {
			throw new ReglaNegocioException("DESCRIPCION_REQUERIDA", "El antecedente necesita una descripcion");
		}
		return d.strip();
	}
}
