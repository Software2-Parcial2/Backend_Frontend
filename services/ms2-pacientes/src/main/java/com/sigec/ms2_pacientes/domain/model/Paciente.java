package com.sigec.ms2_pacientes.domain.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Agregado Paciente. Sin dependencias de frameworks. */
public record Paciente(
		UUID id,
		String nombre,
		String documento,
		LocalDate fechaNacimiento,
		String telefono,
		String email,
		Instant createdAt) {

	public Paciente {
		if (id == null) {
			throw new IllegalArgumentException("El id del paciente es obligatorio");
		}
		if (nombre == null || nombre.isBlank()) {
			throw new IllegalArgumentException("El nombre del paciente es obligatorio");
		}
		if (documento == null || documento.isBlank()) {
			throw new IllegalArgumentException("El documento del paciente es obligatorio");
		}
		if (fechaNacimiento == null || fechaNacimiento.isAfter(LocalDate.now())) {
			throw new IllegalArgumentException("La fecha de nacimiento es obligatoria y no puede ser futura");
		}
	}

	public static Paciente crear(String nombre, String documento, LocalDate fechaNacimiento,
			String telefono, String email) {
		return new Paciente(UUID.randomUUID(), nombre.strip(), documento.strip(), fechaNacimiento,
				telefono, email, Instant.now());
	}
}
