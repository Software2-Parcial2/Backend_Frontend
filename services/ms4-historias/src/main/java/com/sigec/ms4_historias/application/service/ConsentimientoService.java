package com.sigec.ms4_historias.application.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.port.in.ConsentimientosUseCase;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.ConsentimientoRepositoryPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.exception.AccesoDenegadoException;
import com.sigec.ms4_historias.domain.exception.ConflictoException;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.Consentimiento;
import com.sigec.ms4_historias.domain.model.TipoConsentimiento;

/** El paciente otorga y revoca los suyos; el medico solo los consulta. */
public class ConsentimientoService implements ConsentimientosUseCase {

	private final HistoriaRepositoryPort historias;
	private final ConsentimientoRepositoryPort consentimientos;
	private final AuditoriaPort auditoria;

	public ConsentimientoService(HistoriaRepositoryPort historias, ConsentimientoRepositoryPort consentimientos, AuditoriaPort auditoria) {
		this.historias = historias;
		this.consentimientos = consentimientos;
		this.auditoria = auditoria;
	}

	@Override
	public List<Consentimiento> listar(Actor actor, UUID pacienteId) {
		exigirAcceso(actor, pacienteId);
		auditar(actor, pacienteId, Accion.LEER);
		return consentimientos.porPaciente(pacienteId);
	}

	@Override
	public Consentimiento otorgar(Actor actor, UUID pacienteId, TipoConsentimiento tipo, String versionTexto) {
		if (!actor.esPaciente() || !pacienteId.equals(actor.pacienteId())) {
			throw new AccesoDenegadoException("SOLO_EL_PACIENTE", "Solo el propio paciente otorga sus consentimientos");
		}
		Consentimiento c = consentimientos.insertar(new Consentimiento(UUID.randomUUID(), pacienteId, tipo,
				versionTexto == null || versionTexto.isBlank() ? "1" : versionTexto.strip(), Instant.now(), null));
		auditar(actor, pacienteId, Accion.CREAR);
		return c;
	}

	@Override
	public Consentimiento revocar(Actor actor, UUID consentimientoId) {
		Consentimiento c = consentimientos.porId(consentimientoId).orElseThrow(
				() -> new RecursoNoEncontradoException("CONSENTIMIENTO_NO_ENCONTRADO", "No existe el consentimiento"));
		if (!actor.esPaciente() || !c.pacienteId().equals(actor.pacienteId())) {
			// Ajeno: no se revela su existencia.
			throw new RecursoNoEncontradoException("CONSENTIMIENTO_NO_ENCONTRADO", "No existe el consentimiento");
		}
		if (!c.vigente()) {
			throw new ConflictoException("CONSENTIMIENTO_YA_REVOCADO", "El consentimiento ya estaba revocado");
		}
		Consentimiento r = consentimientos.revocar(c.id());
		auditar(actor, c.pacienteId(), Accion.MODIFICAR);
		return r;
	}

	private void exigirAcceso(Actor actor, UUID pacienteId) {
		if (actor.esMedico()) {
			return;
		}
		if (actor.esPaciente()) {
			if (pacienteId.equals(actor.pacienteId())) {
				return;
			}
			throw Acceso.historiaNoEncontrada();
		}
		throw new AccesoDenegadoException("ROL_SIN_ACCESO", "Su rol no puede consultar consentimientos");
	}

	private void auditar(Actor actor, UUID pacienteId, Accion accion) {
		auditoria.registrar(pacienteId, historias.porPacienteId(pacienteId).map(h -> h.id()).orElse(null), actor.usuarioId(), actor.rol(),
				accion, "CONSENTIMIENTO");
	}
}
