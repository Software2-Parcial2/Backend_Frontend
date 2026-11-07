package com.sigec.ms4_historias.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.domain.model.EstudioValidado;

public interface EstudiosUseCase {

	/** Estudios con informe de la historia. El paciente solo ve los validados (no los descartados). */
	List<EstudioValidado> listar(Actor actor, UUID historiaId);
}
