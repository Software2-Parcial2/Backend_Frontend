package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ContactoJpaRepository extends JpaRepository<ContactoEntity, UUID> {

	List<ContactoEntity> findByPacienteIdOrderByCreatedAtAsc(UUID pacienteId);

	long deleteByIdAndPacienteId(UUID id, UUID pacienteId);
}
