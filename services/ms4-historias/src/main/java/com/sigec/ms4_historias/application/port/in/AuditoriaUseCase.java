package com.sigec.ms4_historias.application.port.in;

import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.domain.model.AccesoAuditado;
import com.sigec.ms4_historias.domain.model.Accion;

public interface AuditoriaUseCase {

	Pagina<AccesoAuditado> consultar(Actor actor, UUID historiaId, Accion accion, int limite, String cursor);
}
