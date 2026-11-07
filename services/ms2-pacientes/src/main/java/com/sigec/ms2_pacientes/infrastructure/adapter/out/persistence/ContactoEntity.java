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
@Table(name = "contactos_emergencia")
@Getter
@Setter
@NoArgsConstructor
public class ContactoEntity {

	@Id
	private UUID id;

	@Column(name = "paciente_id", nullable = false)
	private UUID pacienteId;

	@Column(nullable = false)
	private String nombre;

	@Column(nullable = false)
	private String parentesco;

	@Column(nullable = false)
	private String telefono;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;
}
