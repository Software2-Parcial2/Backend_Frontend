package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "medicos")
@Getter
@Setter
@NoArgsConstructor
public class MedicoEntity {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String nombre;

	@Column(nullable = false, unique = true)
	private String documento;

	@Column(nullable = false, unique = true)
	private String matricula;

	@Column(name = "especialidad_id", nullable = false)
	private UUID especialidadId;

	private String email;

	private String telefono;

	@Column(name = "usuario_keycloak", unique = true)
	private String usuarioKeycloak;

	private String consultorio;

	@Column(nullable = false)
	private boolean activo;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;
}
