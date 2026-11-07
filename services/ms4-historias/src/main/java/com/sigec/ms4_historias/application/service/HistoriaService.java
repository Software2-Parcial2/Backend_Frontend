package com.sigec.ms4_historias.application.service;

import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.port.in.HistoriasUseCase;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.Historia;

public class HistoriaService implements HistoriasUseCase {

	private final HistoriaRepositoryPort historias;
	private final AuditoriaPort auditoria;

	public HistoriaService(HistoriaRepositoryPort historias, AuditoriaPort auditoria) {
		this.historias = historias;
		this.auditoria = auditoria;
	}

	@Override
	public Historia porPaciente(Actor actor, UUID pacienteId) {
		Historia h = historias.porPacienteId(pacienteId).orElseThrow(Acceso::historiaNoEncontrada);
		return leer(actor, h);
	}

	@Override
	public Historia porId(Actor actor, UUID historiaId) {
		return leer(actor, historias.porId(historiaId).orElseThrow(Acceso::historiaNoEncontrada));
	}

	private Historia leer(Actor actor, Historia h) {
		Acceso.exigirLectura(actor, h);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "HISTORIA");
		return h;
	}
}
