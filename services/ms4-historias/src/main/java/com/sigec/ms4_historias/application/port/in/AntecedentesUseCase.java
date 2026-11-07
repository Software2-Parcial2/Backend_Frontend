package com.sigec.ms4_historias.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.domain.model.Antecedente;
import com.sigec.ms4_historias.domain.model.TipoAntecedente;

public interface AntecedentesUseCase {

	List<Antecedente> listar(Actor actor, UUID historiaId, boolean soloActivos);

	Antecedente crear(Actor actor, UUID historiaId, TipoAntecedente tipo, String descripcion);

	Antecedente editar(Actor actor, UUID antecedenteId, long version, String descripcion, boolean activo);

	Antecedente desactivar(Actor actor, UUID antecedenteId, long version);
}
