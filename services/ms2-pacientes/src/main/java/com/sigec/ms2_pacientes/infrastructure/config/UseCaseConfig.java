package com.sigec.ms2_pacientes.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.support.TransactionTemplate;

import com.sigec.ms2_pacientes.application.port.in.ActualizarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CatalogoUseCase;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.ContactosUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.SolicitudesUseCase;
import com.sigec.ms2_pacientes.application.port.out.CatalogoRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.ContactoRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.SolicitudRepositoryPort;
import com.sigec.ms2_pacientes.application.service.CatalogoService;
import com.sigec.ms2_pacientes.application.service.ContactoService;
import com.sigec.ms2_pacientes.application.service.PacienteService;
import com.sigec.ms2_pacientes.application.service.SolicitudService;

/**
 * Cablea los casos de uso (application, sin Spring) y les aplica transaccionalidad: el cambio de negocio y la escritura del
 * outbox ocurren en una sola transaccion.
 */
@Configuration
public class UseCaseConfig {

	@Bean
	CrearPacienteUseCase crearPacienteUseCase(PacienteRepositoryPort repository, EventPublisherPort events, TransactionTemplate tx) {
		return Transaccional.envolver(CrearPacienteUseCase.class, new PacienteService(repository, events), tx);
	}

	@Bean
	ConsultarPacienteUseCase consultarPacienteUseCase(PacienteRepositoryPort repository, EventPublisherPort events, TransactionTemplate tx) {
		return Transaccional.envolver(ConsultarPacienteUseCase.class, new PacienteService(repository, events), tx);
	}

	@Bean
	ActualizarPacienteUseCase actualizarPacienteUseCase(PacienteRepositoryPort repository, EventPublisherPort events, TransactionTemplate tx) {
		return Transaccional.envolver(ActualizarPacienteUseCase.class, new PacienteService(repository, events), tx);
	}

	@Bean
	ContactosUseCase contactosUseCase(ContactoRepositoryPort contactos, PacienteRepositoryPort pacientes, TransactionTemplate tx) {
		return Transaccional.envolver(ContactosUseCase.class, new ContactoService(contactos, pacientes), tx);
	}

	@Bean
	SolicitudesUseCase solicitudesUseCase(SolicitudRepositoryPort solicitudes, PacienteRepositoryPort pacientes, EventPublisherPort events,
			TransactionTemplate tx) {
		return Transaccional.envolver(SolicitudesUseCase.class, new SolicitudService(solicitudes, pacientes, events), tx);
	}

	@Bean
	CatalogoUseCase catalogoUseCase(CatalogoRepositoryPort repo, EventPublisherPort events, TransactionTemplate tx) {
		return Transaccional.envolver(CatalogoUseCase.class, new CatalogoService(repo, events), tx);
	}
}
