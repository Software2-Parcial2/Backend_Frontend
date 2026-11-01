package com.sigec.ms2_pacientes.infrastructure.config;

import java.util.List;
import java.util.UUID;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.support.TransactionTemplate;

import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.application.service.PacienteService;
import com.sigec.ms2_pacientes.domain.model.Paciente;

/**
 * Cablea los casos de uso (application, sin Spring) y les aplica transaccionalidad.
 * La escritura del paciente y la del outbox ocurren en una sola transaccion.
 */
@Configuration
public class UseCaseConfig {

	@Bean
	CrearPacienteUseCase crearPacienteUseCase(PacienteRepositoryPort repository, EventPublisherPort events,
			TransactionTemplate tx) {
		PacienteService service = new PacienteService(repository, events);
		return command -> tx.execute(status -> service.crear(command));
	}

	@Bean
	ConsultarPacienteUseCase consultarPacienteUseCase(PacienteRepositoryPort repository, EventPublisherPort events,
			TransactionTemplate tx) {
		PacienteService service = new PacienteService(repository, events);
		return new ConsultarPacienteUseCase() {
			@Override
			public Paciente porId(UUID id) {
				return tx.execute(status -> service.porId(id));
			}

			@Override
			public List<Paciente> listar() {
				return tx.execute(status -> service.listar());
			}
		};
	}
}
