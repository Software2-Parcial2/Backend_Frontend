package com.sigec.ms2_pacientes.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Paciente;

public interface PacienteRepositoryPort {

	Paciente guardar(Paciente paciente);

	Optional<Paciente> buscarPorId(UUID id);

	List<Paciente> buscarTodos();

	boolean existePorDocumento(String documento);
}
