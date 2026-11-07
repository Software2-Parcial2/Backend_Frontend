package com.sigec.ms2_pacientes.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;

public interface ContactosUseCase {

	List<ContactoEmergencia> listar(UUID pacienteId);

	ContactoEmergencia agregar(UUID pacienteId, String nombre, String parentesco, String telefono);

	void eliminar(UUID pacienteId, UUID contactoId);
}
