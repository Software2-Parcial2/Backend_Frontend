package com.sigec.ms4_historias.application.port.out;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.EstudioValidado;

public interface EstudioProyeccionPort {

	/** Idempotente por imagen: una reentrega no duplica. */
	void guardar(EstudioValidado estudio);

	List<EstudioValidado> porPaciente(UUID pacienteId, boolean soloValidados);
}
