package com.sigec.ms4_historias.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.Antecedente;

public interface AntecedenteRepositoryPort {

	Optional<Antecedente> porId(UUID id);

	List<Antecedente> porHistoria(UUID historiaId, boolean soloActivos);

	Antecedente insertar(Antecedente antecedente);

	Antecedente actualizar(Antecedente antecedente, long versionEsperada);
}
