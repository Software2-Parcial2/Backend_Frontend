package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.port.out.CatalogoRepositoryPort;
import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.domain.model.Medico;

@Component
public class CatalogoPersistenceAdapter implements CatalogoRepositoryPort {

	private final EspecialidadJpaRepository especialidades;
	private final MedicoJpaRepository medicos;

	public CatalogoPersistenceAdapter(EspecialidadJpaRepository especialidades, MedicoJpaRepository medicos) {
		this.especialidades = especialidades;
		this.medicos = medicos;
	}

	@Override
	public List<Especialidad> especialidades(boolean soloActivas) {
		return (soloActivas ? especialidades.findByActivaTrueOrderByNombreAsc() : especialidades.findAllByOrderByNombreAsc()).stream()
				.map(CatalogoPersistenceAdapter::aDominio).toList();
	}

	@Override
	public Optional<Especialidad> especialidadPorId(UUID id) {
		return especialidades.findById(id).map(CatalogoPersistenceAdapter::aDominio);
	}

	@Override
	public Optional<Especialidad> especialidadPorCodigo(String codigo) {
		return especialidades.findByCodigo(codigo).map(CatalogoPersistenceAdapter::aDominio);
	}

	@Override
	public Especialidad guardarEspecialidad(Especialidad e) {
		EspecialidadEntity ent = especialidades.findById(e.id()).orElseGet(EspecialidadEntity::new);
		ent.setId(e.id());
		ent.setCodigo(e.codigo());
		ent.setNombre(e.nombre());
		ent.setActiva(e.activa());
		if (ent.getCreatedAt() == null) {
			ent.setCreatedAt(Instant.now());
		}
		return aDominio(especialidades.saveAndFlush(ent));
	}

	@Override
	public List<Medico> medicos(UUID especialidadId, boolean soloActivos) {
		List<MedicoEntity> filas;
		if (especialidadId == null) {
			filas = soloActivos ? medicos.findByActivoTrueOrderByNombreAsc() : medicos.findAllByOrderByNombreAsc();
		}
		else {
			filas = soloActivos ? medicos.findByEspecialidadIdAndActivoTrueOrderByNombreAsc(especialidadId)
					: medicos.findByEspecialidadIdOrderByNombreAsc(especialidadId);
		}
		return filas.stream().map(CatalogoPersistenceAdapter::aDominio).toList();
	}

	@Override
	public Optional<Medico> medicoPorId(UUID id) {
		return medicos.findById(id).map(CatalogoPersistenceAdapter::aDominio);
	}

	@Override
	public Optional<Medico> medicoPorUsuario(String usuarioKeycloak) {
		return medicos.findByUsuarioKeycloak(usuarioKeycloak).map(CatalogoPersistenceAdapter::aDominio);
	}

	@Override
	public Medico guardarMedico(Medico m) {
		MedicoEntity ent = medicos.findById(m.id()).orElseGet(MedicoEntity::new);
		ent.setId(m.id());
		ent.setNombre(m.nombre());
		ent.setDocumento(m.documento());
		ent.setMatricula(m.matricula());
		ent.setEspecialidadId(m.especialidadId());
		ent.setEmail(m.email());
		ent.setTelefono(m.telefono());
		ent.setUsuarioKeycloak(m.usuarioKeycloak());
		ent.setConsultorio(m.consultorio());
		ent.setActivo(m.activo());
		if (ent.getCreatedAt() == null) {
			ent.setCreatedAt(Instant.now());
		}
		return aDominio(medicos.saveAndFlush(ent));
	}

	@Override
	public boolean existeMedicoPorDocumentoOMatricula(String documento, String matricula) {
		return medicos.existsByDocumentoOrMatricula(documento, matricula);
	}

	private static Especialidad aDominio(EspecialidadEntity e) {
		return new Especialidad(e.getId(), e.getCodigo(), e.getNombre(), e.isActiva());
	}

	private static Medico aDominio(MedicoEntity e) {
		return new Medico(e.getId(), e.getNombre(), e.getDocumento(), e.getMatricula(), e.getEspecialidadId(), e.getEmail(), e.getTelefono(),
				e.getUsuarioKeycloak(), e.getConsultorio(), e.isActivo());
	}
}
