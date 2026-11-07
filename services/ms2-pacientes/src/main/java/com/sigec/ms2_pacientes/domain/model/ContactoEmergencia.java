package com.sigec.ms2_pacientes.domain.model;

import java.time.Instant;
import java.util.UUID;

public record ContactoEmergencia(UUID id, UUID pacienteId, String nombre, String parentesco, String telefono, Instant createdAt) {

	public ContactoEmergencia {
		if (nombre == null || nombre.isBlank()) {
			throw new IllegalArgumentException("El nombre del contacto es obligatorio");
		}
		if (parentesco == null || parentesco.isBlank()) {
			throw new IllegalArgumentException("El parentesco es obligatorio");
		}
		if (telefono == null || telefono.isBlank()) {
			throw new IllegalArgumentException("El telefono del contacto es obligatorio");
		}
	}

	public static ContactoEmergencia crear(UUID pacienteId, String nombre, String parentesco, String telefono) {
		return new ContactoEmergencia(UUID.randomUUID(), pacienteId, nombre.strip(), parentesco.strip(), telefono.strip(), Instant.now());
	}
}
