package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "solicitudes_actualizacion")
@Getter
@Setter
@NoArgsConstructor
public class SolicitudEntity {

	@Id
	private UUID id;

	@Column(name = "paciente_id", nullable = false)
	private UUID pacienteId;

	/** En la base se guarda en minuscula (telefono|email|direccion); el convertidor traduce. */
	@Column(nullable = false)
	private String campo;

	@Column(name = "valor_actual")
	private String valorActual;

	@Column(name = "valor_propuesto", nullable = false)
	private String valorPropuesto;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private SolicitudActualizacion.Estado estado;

	@Column(name = "motivo_rechazo")
	private String motivoRechazo;

	@Column(name = "solicitada_en", nullable = false)
	private Instant solicitadaEn;

	@Column(name = "resuelta_en")
	private Instant resueltaEn;

	@Column(name = "resuelta_por")
	private String resueltaPor;
}
