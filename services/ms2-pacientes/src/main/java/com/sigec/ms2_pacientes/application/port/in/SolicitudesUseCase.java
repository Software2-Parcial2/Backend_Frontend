package com.sigec.ms2_pacientes.application.port.in;

import java.util.UUID;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

public interface SolicitudesUseCase {

	SolicitudActualizacion solicitar(UUID pacienteId, SolicitudActualizacion.Campo campo, String valorPropuesto);

	Pagina<SolicitudActualizacion> listar(SolicitudActualizacion.Estado estado, int limite, String cursor);

	Pagina<SolicitudActualizacion> deUnPaciente(UUID pacienteId);

	/** Aplica el cambio al paciente y publica paciente.actualizado. */
	SolicitudActualizacion aprobar(UUID solicitudId, String usuario);

	SolicitudActualizacion rechazar(UUID solicitudId, String usuario, String motivo);
}
