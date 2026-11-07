package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Solo datos de contacto: telefono, email o direccion (nombre y documento se corrigen en ventanilla). */
public record SolicitudRequest(@NotNull SolicitudActualizacion.Campo campo, @NotBlank @Size(max = 300) String valorPropuesto) {
}
