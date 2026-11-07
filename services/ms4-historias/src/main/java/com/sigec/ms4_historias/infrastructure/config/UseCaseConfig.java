package com.sigec.ms4_historias.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.support.TransactionTemplate;

import com.sigec.ms4_historias.application.port.in.AntecedentesUseCase;
import com.sigec.ms4_historias.application.port.in.AuditoriaUseCase;
import com.sigec.ms4_historias.application.port.in.ConsentimientosUseCase;
import com.sigec.ms4_historias.application.port.in.ConsultasUseCase;
import com.sigec.ms4_historias.application.port.in.HistoriasUseCase;
import com.sigec.ms4_historias.application.port.in.EstudiosUseCase;
import com.sigec.ms4_historias.application.port.in.ProyeccionesUseCase;
import com.sigec.ms4_historias.application.port.out.AntecedenteRepositoryPort;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.CitaProyeccionPort;
import com.sigec.ms4_historias.application.port.out.ConsentimientoRepositoryPort;
import com.sigec.ms4_historias.application.port.out.ConsultaRepositoryPort;
import com.sigec.ms4_historias.application.port.out.EstudioProyeccionPort;
import com.sigec.ms4_historias.application.port.out.EventPublisherPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.application.service.AntecedenteService;
import com.sigec.ms4_historias.application.service.AuditoriaService;
import com.sigec.ms4_historias.application.service.ConsentimientoService;
import com.sigec.ms4_historias.application.service.ConsultaService;
import com.sigec.ms4_historias.application.service.EstudioService;
import com.sigec.ms4_historias.application.service.HistoriaService;
import com.sigec.ms4_historias.application.service.ProyeccionService;

/**
 * Cablea los casos de uso (application, sin Spring) y les aplica transaccionalidad: el cambio de negocio, la auditoria de
 * acceso y la escritura del outbox ocurren en una sola transaccion (tambien las lecturas, porque auditan).
 */
@Configuration
public class UseCaseConfig {

	@Bean
	HistoriasUseCase historiasUseCase(HistoriaRepositoryPort historias, AuditoriaPort auditoria, TransactionTemplate tx) {
		return Transaccional.envolver(HistoriasUseCase.class, new HistoriaService(historias, auditoria), tx);
	}

	@Bean
	ConsultasUseCase consultasUseCase(HistoriaRepositoryPort historias, ConsultaRepositoryPort consultas, CitaProyeccionPort citas,
			AuditoriaPort auditoria, EventPublisherPort events, TransactionTemplate tx) {
		return Transaccional.envolver(ConsultasUseCase.class, new ConsultaService(historias, consultas, citas, auditoria, events), tx);
	}

	@Bean
	AntecedentesUseCase antecedentesUseCase(HistoriaRepositoryPort historias, AntecedenteRepositoryPort antecedentes, AuditoriaPort auditoria,
			TransactionTemplate tx) {
		return Transaccional.envolver(AntecedentesUseCase.class, new AntecedenteService(historias, antecedentes, auditoria), tx);
	}

	@Bean
	ConsentimientosUseCase consentimientosUseCase(HistoriaRepositoryPort historias, ConsentimientoRepositoryPort consentimientos,
			AuditoriaPort auditoria, TransactionTemplate tx) {
		return Transaccional.envolver(ConsentimientosUseCase.class, new ConsentimientoService(historias, consentimientos, auditoria), tx);
	}

	@Bean
	AuditoriaUseCase auditoriaUseCase(HistoriaRepositoryPort historias, AuditoriaPort auditoria, TransactionTemplate tx) {
		return Transaccional.envolver(AuditoriaUseCase.class, new AuditoriaService(historias, auditoria), tx);
	}

	@Bean
	ProyeccionesUseCase proyeccionesUseCase(HistoriaRepositoryPort historias, CitaProyeccionPort citas, EstudioProyeccionPort estudios,
			TransactionTemplate tx) {
		return Transaccional.envolver(ProyeccionesUseCase.class, new ProyeccionService(historias, citas, estudios), tx);
	}

	@Bean
	EstudiosUseCase estudiosUseCase(HistoriaRepositoryPort historias, EstudioProyeccionPort estudios, AuditoriaPort auditoria,
			TransactionTemplate tx) {
		return Transaccional.envolver(EstudiosUseCase.class, new EstudioService(historias, estudios, auditoria), tx);
	}
}
