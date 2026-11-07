package com.sigec.ms4_historias.application.service;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.port.in.AntecedentesUseCase;
import com.sigec.ms4_historias.application.port.out.AntecedenteRepositoryPort;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.exception.VersionConflictoException;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.Antecedente;
import com.sigec.ms4_historias.domain.model.Historia;
import com.sigec.ms4_historias.domain.model.TipoAntecedente;

public class AntecedenteService implements AntecedentesUseCase {

	private final HistoriaRepositoryPort historias;
	private final AntecedenteRepositoryPort antecedentes;
	private final AuditoriaPort auditoria;

	public AntecedenteService(HistoriaRepositoryPort historias, AntecedenteRepositoryPort antecedentes, AuditoriaPort auditoria) {
		this.historias = historias;
		this.antecedentes = antecedentes;
		this.auditoria = auditoria;
	}

	@Override
	public List<Antecedente> listar(Actor actor, UUID historiaId, boolean soloActivos) {
		Acceso.exigirMedico(actor);
		Historia h = historia(historiaId);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "ANTECEDENTES");
		return antecedentes.porHistoria(h.id(), soloActivos);
	}

	@Override
	public Antecedente crear(Actor actor, UUID historiaId, TipoAntecedente tipo, String descripcion) {
		Acceso.exigirMedico(actor);
		Historia h = historia(historiaId);
		Antecedente a = antecedentes.insertar(Antecedente.nuevo(h.id(), tipo, descripcion));
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.CREAR, "ANTECEDENTE");
		return a;
	}

	@Override
	public Antecedente editar(Actor actor, UUID antecedenteId, long version, String descripcion, boolean activo) {
		Acceso.exigirMedico(actor);
		Antecedente a = antecedentes.porId(antecedenteId)
				.orElseThrow(() -> new RecursoNoEncontradoException("ANTECEDENTE_NO_ENCONTRADO", "No existe el antecedente"));
		Historia h = historia(a.historiaId());
		if (a.version() != version) {
			throw new VersionConflictoException(a.version());
		}
		Antecedente guardado = antecedentes.actualizar(a.editar(descripcion, activo), version);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.MODIFICAR, "ANTECEDENTE");
		return guardado;
	}

	@Override
	public Antecedente desactivar(Actor actor, UUID antecedenteId, long version) {
		Acceso.exigirMedico(actor);
		Antecedente a = antecedentes.porId(antecedenteId)
				.orElseThrow(() -> new RecursoNoEncontradoException("ANTECEDENTE_NO_ENCONTRADO", "No existe el antecedente"));
		return editar(actor, antecedenteId, version, a.descripcion(), false);
	}

	private Historia historia(UUID id) {
		return historias.porId(id).orElseThrow(Acceso::historiaNoEncontrada);
	}
}
