package com.sigec.ms4_historias.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.Consentimiento;

public interface ConsentimientoRepositoryPort {

	Optional<Consentimiento> porId(UUID id);

	List<Consentimiento> porPaciente(UUID pacienteId);

	/** @throws com.sigec.ms4_historias.domain.exception.ConflictoException CONSENTIMIENTO_VIGENTE si ya hay uno vigente del tipo */
	Consentimiento insertar(Consentimiento consentimiento);

	Consentimiento revocar(UUID id);
}
