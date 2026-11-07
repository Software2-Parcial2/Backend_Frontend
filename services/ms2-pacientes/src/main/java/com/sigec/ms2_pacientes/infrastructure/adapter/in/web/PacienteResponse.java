package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Sexo;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

public record PacienteResponse(
		UUID id,
		String numeroHistoria,
		String nombre,
		String documento,
		LocalDate fechaNacimiento,
		int edad,
		Sexo sexo,
		String telefono,
		String email,
		String direccion,
		boolean beca,
		TipoSeguro tipoSeguro,
		long version,
		Instant createdAt,
		Instant updatedAt) {
}
