package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ContactoRequest(
		@NotBlank @Size(max = 200) String nombre,
		@NotBlank @Size(max = 60) String parentesco,
		@NotBlank @Size(max = 30) String telefono) {
}
