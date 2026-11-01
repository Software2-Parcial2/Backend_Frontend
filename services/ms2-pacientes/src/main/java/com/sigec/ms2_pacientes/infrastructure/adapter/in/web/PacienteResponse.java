package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record PacienteResponse(
		UUID id,
		String nombre,
		String documento,
		LocalDate fechaNacimiento,
		String telefono,
		String email,
		Instant createdAt) {
}
