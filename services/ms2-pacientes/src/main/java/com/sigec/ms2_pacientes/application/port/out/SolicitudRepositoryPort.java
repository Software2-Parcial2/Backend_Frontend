package com.sigec.ms2_pacientes.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

public interface SolicitudRepositoryPort {

	SolicitudActualizacion guardar(SolicitudActualizacion solicitud);

	Optional<SolicitudActualizacion> porId(UUID id);

	boolean hayPendiente(UUID pacienteId, SolicitudActualizacion.Campo campo);

	Pagina<SolicitudActualizacion> listar(SolicitudActualizacion.Estado estado, int limite, String cursor);

	List<SolicitudActualizacion> porPaciente(UUID pacienteId);
}
