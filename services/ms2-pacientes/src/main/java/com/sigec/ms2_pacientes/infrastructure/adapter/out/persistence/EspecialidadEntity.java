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
@Table(name = "especialidades")
@Getter
@Setter
@NoArgsConstructor
public class EspecialidadEntity {

	@Id
	private UUID id;

	@Column(nullable = false, unique = true)
	private String codigo;

	@Column(nullable = false)
	private String nombre;

	@Column(nullable = false)
	private boolean activa;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;
}
