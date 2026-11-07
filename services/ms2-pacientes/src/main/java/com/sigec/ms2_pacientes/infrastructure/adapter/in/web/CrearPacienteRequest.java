package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.time.LocalDate;

import com.sigec.ms2_pacientes.domain.model.Sexo;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

public record CrearPacienteRequest(
		@NotBlank @Size(max = 200) String nombre,
		@NotBlank @Size(max = 30) String documento,
		@NotNull @Past LocalDate fechaNacimiento,
		Sexo sexo,
		@Size(max = 30) String telefono,
		@Email @Size(max = 200) String email,
		@Size(max = 300) String direccion,
		Boolean beca,
		TipoSeguro tipoSeguro,
		@Size(max = 100) String usuarioSub) {
}
