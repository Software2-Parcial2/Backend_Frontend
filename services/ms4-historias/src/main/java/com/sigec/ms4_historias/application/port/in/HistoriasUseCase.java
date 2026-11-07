package com.sigec.ms4_historias.application.port.in;

import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.domain.model.Historia;

public interface HistoriasUseCase {

	Historia porPaciente(Actor actor, UUID pacienteId);

	Historia porId(Actor actor, UUID historiaId);
}
