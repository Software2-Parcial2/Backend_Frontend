package com.sigec.ms2_pacientes.application.service;

import java.util.UUID;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.ActualizarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.domain.event.PacienteActualizado;
import com.sigec.ms2_pacientes.domain.event.PacienteCreado;
import com.sigec.ms2_pacientes.domain.exception.ConflictoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteDuplicadoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;
import com.sigec.ms2_pacientes.domain.exception.VersionConflictoException;
import com.sigec.ms2_pacientes.domain.model.Paciente;

/** Casos de uso de pacientes. Sin Spring: la transaccionalidad la aporta infrastructure.config.UseCaseConfig. */
public class PacienteService implements CrearPacienteUseCase, ConsultarPacienteUseCase, ActualizarPacienteUseCase {

	private final PacienteRepositoryPort repository;
	private final EventPublisherPort eventPublisher;

	public PacienteService(PacienteRepositoryPort repository, EventPublisherPort eventPublisher) {
		this.repository = repository;
		this.eventPublisher = eventPublisher;
	}

	@Override
	public Paciente crear(CrearPacienteUseCase.Command c) {
		if (repository.existePorDocumento(c.documento().strip())) {
			throw new PacienteDuplicadoException(c.documento());
		}
		if (c.usuarioSub() != null && !c.usuarioSub().isBlank() && repository.existePorUsuarioSub(c.usuarioSub().strip())) {
			throw new ConflictoException("USUARIO_YA_VINCULADO", "Ese usuario ya esta vinculado a otro paciente");
		}
		Paciente paciente = Paciente.crear(repository.siguienteNumeroHistoria(), c.nombre(), c.documento(), c.fechaNacimiento(), c.sexo(),
				c.telefono(), c.email(), c.direccion(), c.beca(), c.tipoSeguro(), c.usuarioSub());
		Paciente guardado = repository.guardar(paciente);
		eventPublisher.publicar(PacienteCreado.de(guardado));
		return guardado;
	}

	@Override
	public Paciente porId(UUID id) {
		return repository.buscarPorId(id).orElseThrow(() -> new PacienteNoEncontradoException(id));
	}

	@Override
	public Paciente porUsuarioSub(String sub) {
		return repository.buscarPorUsuarioSub(sub)
				.orElseThrow(() -> new com.sigec.ms2_pacientes.domain.exception.RecursoNoEncontradoException("PACIENTE_NO_VINCULADO",
						"Su usuario no esta vinculado a un paciente"));
	}

	@Override
	public Pagina<Paciente> buscar(Busqueda busqueda) {
		return repository.buscar(busqueda);
	}

	@Override
	public Paciente actualizar(UUID id, long versionEsperada, ActualizarPacienteUseCase.Command c) {
		Paciente actual = porId(id);
		long vigente = actual.version() == null ? 0 : actual.version();
		if (vigente != versionEsperada) {
			throw new VersionConflictoException(vigente);
		}
		Paciente guardado = repository.guardar(actual.actualizar(c.nombre(), c.fechaNacimiento(), c.sexo(), c.telefono(), c.email(),
				c.direccion(), c.beca(), c.tipoSeguro()));
		eventPublisher.publicar(PacienteActualizado.de(guardado));
		return guardado;
	}
}
