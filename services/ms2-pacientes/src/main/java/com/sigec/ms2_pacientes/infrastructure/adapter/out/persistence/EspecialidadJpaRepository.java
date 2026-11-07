package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EspecialidadJpaRepository extends JpaRepository<EspecialidadEntity, UUID> {

	Optional<EspecialidadEntity> findByCodigo(String codigo);

	List<EspecialidadEntity> findByActivaTrueOrderByNombreAsc();

	List<EspecialidadEntity> findAllByOrderByNombreAsc();
}
