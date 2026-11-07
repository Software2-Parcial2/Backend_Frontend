package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.util.UUID;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** DTOs del catalogo de especialidades y medicos. */
public final class CatalogoDtos {

	private CatalogoDtos() {
	}

	public record EspecialidadResponse(UUID id, String codigo, String nombre, boolean activa) {
	}

	public record CrearEspecialidadRequest(
			@NotBlank @Pattern(regexp = "[a-z0-9_]+", message = "solo minusculas, numeros y guion bajo") @Size(max = 40) String codigo,
			@NotBlank @Size(max = 100) String nombre) {
	}

	public record ActualizarEspecialidadRequest(@NotBlank @Size(max = 100) String nombre, Boolean activa) {
	}

	/** Lo que ve cualquier usuario autenticado (el paciente elige medico al solicitar su cita). Sin documento ni contacto. */
	public record MedicoResumen(UUID id, String nombre, String matricula, EspecialidadResumen especialidad, String consultorio, boolean activo) {
	}

	public record EspecialidadResumen(String codigo, String nombre) {
	}

	/** Dato maestro completo: solo para administrador. */
	public record MedicoResponse(UUID id, String nombre, String documento, String matricula, EspecialidadResumen especialidad, String email,
			String telefono, String usuarioKeycloak, String consultorio, boolean activo) {
	}

	public record MedicoRequest(
			@NotBlank @Size(max = 200) String nombre,
			@NotBlank @Size(max = 30) String documento,
			@NotBlank @Size(max = 30) String matricula,
			@NotBlank String especialidad,
			@Email @Size(max = 200) String email,
			@Size(max = 30) String telefono,
			@Size(max = 100) String usuarioKeycloak,
			@Size(max = 30) String consultorio,
			Boolean activo) {
	}
}
