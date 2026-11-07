package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MedicoJpaRepository extends JpaRepository<MedicoEntity, UUID> {

	Optional<MedicoEntity> findByUsuarioKeycloak(String usuarioKeycloak);

	boolean existsByDocumentoOrMatricula(String documento, String matricula);

	List<MedicoEntity> findAllByOrderByNombreAsc();

	List<MedicoEntity> findByActivoTrueOrderByNombreAsc();

	List<MedicoEntity> findByEspecialidadIdOrderByNombreAsc(UUID especialidadId);

	List<MedicoEntity> findByEspecialidadIdAndActivoTrueOrderByNombreAsc(UUID especialidadId);
}
