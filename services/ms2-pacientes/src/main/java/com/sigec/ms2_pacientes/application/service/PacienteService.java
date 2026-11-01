package com.sigec.ms2_pacientes.application.service;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.domain.event.PacienteCreado;
import com.sigec.ms2_pacientes.domain.exception.PacienteDuplicadoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;
import com.sigec.ms2_pacientes.domain.model.Paciente;

/**
 * Casos de uso de pacientes. Sin dependencias de Spring: la transaccionalidad la
 * aporta infrastructure.config.UseCaseConfig.
 */
public class PacienteService implements CrearPacienteUseCase, ConsultarPacienteUseCase {

	private final PacienteRepositoryPort repository;
	private final EventPublisherPort eventPublisher;

	public PacienteService(PacienteRepositoryPort repository, EventPublisherPort eventPublisher) {
		this.repository = repository;
		this.eventPublisher = eventPublisher;
	}

	@Override
	public Paciente crear(Command command) {
		if (repository.existePorDocumento(command.documento().strip())) {
			throw new PacienteDuplicadoException(command.documento());
		}
		Paciente paciente = Paciente.crear(command.nombre(), command.documento(), command.fechaNacimiento(),
				command.telefono(), command.email());
		Paciente guardado = repository.guardar(paciente);
		eventPublisher.publicar(PacienteCreado.de(guardado));
		return guardado;
	}

	@Override
	public Paciente porId(UUID id) {
		return repository.buscarPorId(id).orElseThrow(() -> new PacienteNoEncontradoException(id));
	}

	@Override
	public List<Paciente> listar() {
		return repository.buscarTodos();
	}
}
