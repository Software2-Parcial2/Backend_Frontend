package com.sigec.ms2_pacientes.domain.model;

import java.util.UUID;

/** Medico (dato maestro). {@code usuarioKeycloak} es el preferred_username que lo une con su cuenta. */
public record Medico(
		UUID id,
		String nombre,
		String documento,
		String matricula,
		UUID especialidadId,
		String email,
		String telefono,
		String usuarioKeycloak,
		String consultorio,
		boolean activo) {

	public Medico {
		if (nombre == null || nombre.isBlank()) {
			throw new IllegalArgumentException("El nombre del medico es obligatorio");
		}
		if (documento == null || documento.isBlank() || matricula == null || matricula.isBlank()) {
			throw new IllegalArgumentException("El documento y la matricula del medico son obligatorios");
		}
		if (especialidadId == null) {
			throw new IllegalArgumentException("La especialidad del medico es obligatoria");
		}
	}

	public static Medico crear(String nombre, String documento, String matricula, UUID especialidadId, String email, String telefono,
			String usuarioKeycloak, String consultorio) {
		return new Medico(UUID.randomUUID(), nombre.strip(), documento.strip(), matricula.strip(), especialidadId, vacio(email),
				vacio(telefono), vacio(usuarioKeycloak), vacio(consultorio), true);
	}

	public Medico actualizar(String nombre, UUID especialidadId, String email, String telefono, String usuarioKeycloak, String consultorio,
			boolean activo) {
		return new Medico(id, nombre.strip(), documento, matricula, especialidadId, vacio(email), vacio(telefono), vacio(usuarioKeycloak),
				vacio(consultorio), activo);
	}

	private static String vacio(String s) {
		return s == null || s.isBlank() ? null : s.strip();
	}
}
