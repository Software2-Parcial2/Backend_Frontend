package com.sigec.ms2_pacientes.application.service;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.application.port.in.ContactosUseCase;
import com.sigec.ms2_pacientes.application.port.out.ContactoRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;
import com.sigec.ms2_pacientes.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;

public class ContactoService implements ContactosUseCase {

	private final ContactoRepositoryPort contactos;
	private final PacienteRepositoryPort pacientes;

	public ContactoService(ContactoRepositoryPort contactos, PacienteRepositoryPort pacientes) {
		this.contactos = contactos;
		this.pacientes = pacientes;
	}

	@Override
	public List<ContactoEmergencia> listar(UUID pacienteId) {
		existe(pacienteId);
		return contactos.porPaciente(pacienteId);
	}

	@Override
	public ContactoEmergencia agregar(UUID pacienteId, String nombre, String parentesco, String telefono) {
		existe(pacienteId);
		return contactos.guardar(ContactoEmergencia.crear(pacienteId, nombre, parentesco, telefono));
	}

	@Override
	public void eliminar(UUID pacienteId, UUID contactoId) {
		existe(pacienteId);
		if (!contactos.eliminar(pacienteId, contactoId)) {
			throw new RecursoNoEncontradoException("CONTACTO_NO_ENCONTRADO", "No existe el contacto " + contactoId);
		}
	}

	private void existe(UUID pacienteId) {
		pacientes.buscarPorId(pacienteId).orElseThrow(() -> new PacienteNoEncontradoException(pacienteId));
	}
}
