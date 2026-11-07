package com.sigec.ms4_historias.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.domain.model.Consentimiento;
import com.sigec.ms4_historias.domain.model.TipoConsentimiento;

public interface ConsentimientosUseCase {

	List<Consentimiento> listar(Actor actor, UUID pacienteId);

	Consentimiento otorgar(Actor actor, UUID pacienteId, TipoConsentimiento tipo, String versionTexto);

	Consentimiento revocar(Actor actor, UUID consentimientoId);
}
