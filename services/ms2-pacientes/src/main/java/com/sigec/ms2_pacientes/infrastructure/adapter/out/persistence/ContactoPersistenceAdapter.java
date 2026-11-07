package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.port.out.ContactoRepositoryPort;
import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;

@Component
public class ContactoPersistenceAdapter implements ContactoRepositoryPort {

	private final ContactoJpaRepository repo;

	public ContactoPersistenceAdapter(ContactoJpaRepository repo) {
		this.repo = repo;
	}

	@Override
	public List<ContactoEmergencia> porPaciente(UUID pacienteId) {
		return repo.findByPacienteIdOrderByCreatedAtAsc(pacienteId).stream().map(ContactoPersistenceAdapter::aDominio).toList();
	}

	@Override
	public ContactoEmergencia guardar(ContactoEmergencia c) {
		ContactoEntity e = new ContactoEntity();
		e.setId(c.id());
		e.setPacienteId(c.pacienteId());
		e.setNombre(c.nombre());
		e.setParentesco(c.parentesco());
		e.setTelefono(c.telefono());
		e.setCreatedAt(c.createdAt());
		return aDominio(repo.saveAndFlush(e));
	}

	@Override
	public boolean eliminar(UUID pacienteId, UUID contactoId) {
		return repo.deleteByIdAndPacienteId(contactoId, pacienteId) > 0;
	}

	private static ContactoEmergencia aDominio(ContactoEntity e) {
		return new ContactoEmergencia(e.getId(), e.getPacienteId(), e.getNombre(), e.getParentesco(), e.getTelefono(), e.getCreatedAt());
	}
}
