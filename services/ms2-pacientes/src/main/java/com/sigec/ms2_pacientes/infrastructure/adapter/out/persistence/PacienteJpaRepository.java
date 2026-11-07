package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PacienteJpaRepository extends JpaRepository<PacienteEntity, UUID> {

	boolean existsByDocumento(String documento);

	boolean existsByUsuarioSub(String usuarioSub);

	Optional<PacienteEntity> findByUsuarioSub(String usuarioSub);
}
