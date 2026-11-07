package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SolicitudJpaRepository extends JpaRepository<SolicitudEntity, UUID> {

	boolean existsByPacienteIdAndCampoAndEstado(UUID pacienteId, String campo, com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion.Estado estado);

	List<SolicitudEntity> findByPacienteIdOrderBySolicitadaEnDescIdDesc(UUID pacienteId);
}
