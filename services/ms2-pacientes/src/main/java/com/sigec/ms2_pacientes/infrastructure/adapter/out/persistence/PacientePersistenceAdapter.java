package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.domain.model.Paciente;

@Component
public class PacientePersistenceAdapter implements PacienteRepositoryPort {

	private final PacienteJpaRepository repository;
	private final PacientePersistenceMapper mapper;

	public PacientePersistenceAdapter(PacienteJpaRepository repository, PacientePersistenceMapper mapper) {
		this.repository = repository;
		this.mapper = mapper;
	}

	@Override
	public Paciente guardar(Paciente paciente) {
		return mapper.toDomain(repository.save(mapper.toEntity(paciente)));
	}

	@Override
	public Optional<Paciente> buscarPorId(UUID id) {
		return repository.findById(id).map(mapper::toDomain);
	}

	@Override
	public List<Paciente> buscarTodos() {
		return repository.findAll().stream().map(mapper::toDomain).toList();
	}

	@Override
	public boolean existePorDocumento(String documento) {
		return repository.existsByDocumento(documento);
	}
}
