package com.sigec.ms4_historias.application.service;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.port.in.EstudiosUseCase;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.EstudioProyeccionPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.EstudioValidado;
import com.sigec.ms4_historias.domain.model.Historia;

public class EstudioService implements EstudiosUseCase {

	private final HistoriaRepositoryPort historias;
	private final EstudioProyeccionPort estudios;
	private final AuditoriaPort auditoria;

	public EstudioService(HistoriaRepositoryPort historias, EstudioProyeccionPort estudios, AuditoriaPort auditoria) {
		this.historias = historias;
		this.estudios = estudios;
		this.auditoria = auditoria;
	}

	@Override
	public List<EstudioValidado> listar(Actor actor, UUID historiaId) {
		Historia h = historias.porId(historiaId).orElseThrow(Acceso::historiaNoEncontrada);
		Acceso.exigirLectura(actor, h);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "ESTUDIOS");
		return estudios.porPaciente(h.pacienteId(), actor.esPaciente());
	}
}
