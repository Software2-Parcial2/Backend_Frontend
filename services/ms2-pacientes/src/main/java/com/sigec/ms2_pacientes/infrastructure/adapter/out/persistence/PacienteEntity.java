package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Sexo;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
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

	@Column(name = "numero_historia", nullable = false, updatable = false)
	private String numeroHistoria;

	@Column(nullable = false)
	private String nombre;

	@Column(nullable = false, unique = true)
	private String documento;

	@Column(name = "fecha_nacimiento", nullable = false)
	private LocalDate fechaNacimiento;

	@Enumerated(EnumType.STRING)
	private Sexo sexo;

	private String telefono;

	private String email;

	private String direccion;

	@Column(nullable = false)
	private boolean beca;

	@Enumerated(EnumType.STRING)
	@Column(name = "tipo_seguro", nullable = false)
	private TipoSeguro tipoSeguro;

	@Column(name = "usuario_sub")
	private String usuarioSub;

	/** Control de concurrencia optimista: Hibernate lo incrementa en cada UPDATE y falla si cambio. */
	@Version
	private Long version;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;
}
