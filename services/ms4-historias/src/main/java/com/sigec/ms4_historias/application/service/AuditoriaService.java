package com.sigec.ms4_historias.application.service;

import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.application.port.in.AuditoriaUseCase;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.exception.AccesoDenegadoException;
import com.sigec.ms4_historias.domain.model.AccesoAuditado;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.Historia;

/** Quien vio o cambio una historia. Solo el administrador; sin contenido clinico. */
public class AuditoriaService implements AuditoriaUseCase {

	private final HistoriaRepositoryPort historias;
	private final AuditoriaPort auditoria;

	public AuditoriaService(HistoriaRepositoryPort historias, AuditoriaPort auditoria) {
		this.historias = historias;
		this.auditoria = auditoria;
	}

	@Override
	public Pagina<AccesoAuditado> consultar(Actor actor, UUID historiaId, Accion accion, int limite, String cursor) {
		if (!"administrador".equals(actor.rol())) {
			throw new AccesoDenegadoException("ROL_SIN_ACCESO", "Solo el administrador consulta la auditoria");
		}
		Historia h = historias.porId(historiaId).orElseThrow(Acceso::historiaNoEncontrada);
		Pagina<AccesoAuditado> p = auditoria.pagina(h.id(), accion, limite, cursor);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "AUDITORIA");
		return p;
	}
}
