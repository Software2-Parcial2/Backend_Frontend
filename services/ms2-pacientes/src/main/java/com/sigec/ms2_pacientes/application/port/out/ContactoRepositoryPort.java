package com.sigec.ms2_pacientes.application.port.out;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;

public interface ContactoRepositoryPort {

	List<ContactoEmergencia> porPaciente(UUID pacienteId);

	ContactoEmergencia guardar(ContactoEmergencia contacto);

	/** @return true si existia y era de ese paciente. */
	boolean eliminar(UUID pacienteId, UUID contactoId);
}
