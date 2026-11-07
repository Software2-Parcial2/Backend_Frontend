package com.sigec.ms4_historias.application.port.out;

import java.util.UUID;

import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.domain.model.AccesoAuditado;
import com.sigec.ms4_historias.domain.model.Accion;

public interface AuditoriaPort {

	void registrar(UUID pacienteId, UUID historiaId, String usuarioId, String rol, Accion accion, String recurso);

	Pagina<AccesoAuditado> pagina(UUID historiaId, Accion accion, int limite, String cursor);
}
