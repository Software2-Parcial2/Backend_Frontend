package com.sigec.ms2_pacientes.domain.model;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Agregado Paciente. Sin dependencias de frameworks. {@code version} es null mientras no se ha guardado. */
public record Paciente(
		UUID id,
		String numeroHistoria,
		String nombre,
		String documento,
		LocalDate fechaNacimiento,
		Sexo sexo,
		String telefono,
		String email,
		String direccion,
		boolean beca,
		TipoSeguro tipoSeguro,
		String usuarioSub,
		Long version,
		Instant createdAt,
		Instant updatedAt) {

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
		if (tipoSeguro == null) {
			tipoSeguro = TipoSeguro.NINGUNO;
		}
	}

	public static Paciente crear(String numeroHistoria, String nombre, String documento, LocalDate fechaNacimiento, Sexo sexo,
			String telefono, String email, String direccion, boolean beca, TipoSeguro tipoSeguro, String usuarioSub) {
		Instant ahora = Instant.now();
		return new Paciente(UUID.randomUUID(), numeroHistoria, nombre.strip(), documento.strip(), fechaNacimiento, sexo,
				blanco(telefono), blanco(email), blanco(direccion), beca, tipoSeguro, blanco(usuarioSub), null, ahora, ahora);
	}

	/** Copia con los datos editables cambiados (el documento no se toca aqui: se corrige en ventanilla con otro caso de uso). */
	public Paciente actualizar(String nombre, LocalDate fechaNacimiento, Sexo sexo, String telefono, String email,
			String direccion, boolean beca, TipoSeguro tipoSeguro) {
		return new Paciente(id, numeroHistoria, nombre.strip(), documento, fechaNacimiento, sexo, blanco(telefono), blanco(email),
				blanco(direccion), beca, tipoSeguro, usuarioSub, version, createdAt, Instant.now());
	}

	/** Copia con un unico dato de contacto cambiado (solicitud aprobada). */
	public Paciente conContacto(SolicitudActualizacion.Campo campo, String valor) {
		return switch (campo) {
			case TELEFONO -> new Paciente(id, numeroHistoria, nombre, documento, fechaNacimiento, sexo, valor, email, direccion, beca,
					tipoSeguro, usuarioSub, version, createdAt, Instant.now());
			case EMAIL -> new Paciente(id, numeroHistoria, nombre, documento, fechaNacimiento, sexo, telefono, valor, direccion, beca,
					tipoSeguro, usuarioSub, version, createdAt, Instant.now());
			case DIRECCION -> new Paciente(id, numeroHistoria, nombre, documento, fechaNacimiento, sexo, telefono, email, valor, beca,
					tipoSeguro, usuarioSub, version, createdAt, Instant.now());
		};
	}

	/** Valor actual de un dato de contacto. */
	public String contacto(SolicitudActualizacion.Campo campo) {
		return switch (campo) {
			case TELEFONO -> telefono;
			case EMAIL -> email;
			case DIRECCION -> direccion;
		};
	}

	private static String blanco(String s) {
		return s == null || s.isBlank() ? null : s.strip();
	}
}
