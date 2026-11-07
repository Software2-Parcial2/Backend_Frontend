package com.sigec.ms2_pacientes.domain.model;

import java.util.UUID;

/** Especialidad del catalogo. {@code codigo} (minusculas y guion bajo) es la clave natural que usan MS3, MS4 y MS6. */
public record Especialidad(UUID id, String codigo, String nombre, boolean activa) {

	public Especialidad {
		if (codigo == null || !codigo.matches("[a-z0-9_]+")) {
			throw new IllegalArgumentException("El codigo de especialidad solo admite minusculas, numeros y guion bajo");
		}
		if (nombre == null || nombre.isBlank()) {
			throw new IllegalArgumentException("El nombre de la especialidad es obligatorio");
		}
	}

	public static Especialidad crear(String codigo, String nombre) {
		return new Especialidad(UUID.randomUUID(), codigo.strip(), nombre.strip(), true);
	}

	public Especialidad actualizar(String nombre, boolean activa) {
		return new Especialidad(id, codigo, nombre.strip(), activa);
	}
}
