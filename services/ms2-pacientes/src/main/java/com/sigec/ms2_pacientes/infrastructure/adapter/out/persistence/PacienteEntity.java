package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "pacientes")
@Getter
@Setter
@NoArgsConstructor
public class PacienteEntity {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String nombre;

	@Column(nullable = false, unique = true)
	private String documento;

	@Column(name = "fecha_nacimiento", nullable = false)
	private LocalDate fechaNacimiento;

	private String telefono;

	private String email;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;
}
