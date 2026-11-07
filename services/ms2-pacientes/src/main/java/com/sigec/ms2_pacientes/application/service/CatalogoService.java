package com.sigec.ms2_pacientes.application.service;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.application.port.in.CatalogoUseCase;
import com.sigec.ms2_pacientes.application.port.out.CatalogoRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.domain.event.MedicoActualizado;
import com.sigec.ms2_pacientes.domain.event.MedicoCreado;
import com.sigec.ms2_pacientes.domain.exception.ConflictoException;
import com.sigec.ms2_pacientes.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.domain.model.Medico;

public class CatalogoService implements CatalogoUseCase {

	private final CatalogoRepositoryPort repo;
	private final EventPublisherPort eventos;

	public CatalogoService(CatalogoRepositoryPort repo, EventPublisherPort eventos) {
		this.repo = repo;
		this.eventos = eventos;
	}

	@Override
	public List<Especialidad> especialidades(boolean soloActivas) {
		return repo.especialidades(soloActivas);
	}

	@Override
	public Especialidad crearEspecialidad(String codigo, String nombre) {
		if (repo.especialidadPorCodigo(codigo.strip()).isPresent()) {
			throw new ConflictoException("ESPECIALIDAD_DUPLICADA", "Ya existe la especialidad " + codigo);
		}
		return repo.guardarEspecialidad(Especialidad.crear(codigo, nombre));
	}

	@Override
	public Especialidad actualizarEspecialidad(UUID id, String nombre, boolean activa) {
		Especialidad e = repo.especialidadPorId(id)
				.orElseThrow(() -> new RecursoNoEncontradoException("ESPECIALIDAD_NO_ENCONTRADA", "No existe la especialidad " + id));
		return repo.guardarEspecialidad(e.actualizar(nombre, activa));
	}

	@Override
	public List<MedicoConEspecialidad> medicos(String especialidadCodigo, boolean soloActivos) {
		UUID filtro = null;
		if (especialidadCodigo != null && !especialidadCodigo.isBlank()) {
			Especialidad e = repo.especialidadPorCodigo(especialidadCodigo.strip()).orElse(null);
			if (e == null) {
				return List.of();
			}
			filtro = e.id();
		}
		return repo.medicos(filtro, soloActivos).stream().map(this::conEspecialidad).toList();
	}

	@Override
	public MedicoConEspecialidad medico(UUID id) {
		return conEspecialidad(repo.medicoPorId(id).orElseThrow(() -> noEncontrado(id)));
	}

	@Override
	public MedicoConEspecialidad medicoPorUsuario(String usuarioKeycloak) {
		return conEspecialidad(repo.medicoPorUsuario(usuarioKeycloak)
				.orElseThrow(() -> new RecursoNoEncontradoException("MEDICO_NO_VINCULADO", "Su usuario no esta vinculado a un medico")));
	}

	@Override
	public MedicoConEspecialidad crearMedico(MedicoCommand c) {
		Especialidad e = especialidadObligatoria(c.especialidadCodigo());
		if (repo.existeMedicoPorDocumentoOMatricula(c.documento().strip(), c.matricula().strip())) {
			throw new ConflictoException("MEDICO_DUPLICADO", "Ya existe un medico con ese documento o matricula");
		}
		Medico m = repo.guardarMedico(Medico.crear(c.nombre(), c.documento(), c.matricula(), e.id(), c.email(), c.telefono(),
				c.usuarioKeycloak(), c.consultorio()));
		eventos.publicar(MedicoCreado.de(m, e));
		return new MedicoConEspecialidad(m, e);
	}

	@Override
	public MedicoConEspecialidad actualizarMedico(UUID id, MedicoCommand c, boolean activo) {
		Medico actual = repo.medicoPorId(id).orElseThrow(() -> noEncontrado(id));
		Especialidad e = especialidadObligatoria(c.especialidadCodigo());
		Medico m = repo.guardarMedico(actual.actualizar(c.nombre(), e.id(), c.email(), c.telefono(), c.usuarioKeycloak(), c.consultorio(), activo));
		eventos.publicar(MedicoActualizado.de(m, e));
		return new MedicoConEspecialidad(m, e);
	}

	private Especialidad especialidadObligatoria(String codigo) {
		return repo.especialidadPorCodigo(codigo.strip())
				.orElseThrow(() -> new RecursoNoEncontradoException("ESPECIALIDAD_NO_ENCONTRADA", "No existe la especialidad " + codigo));
	}

	private MedicoConEspecialidad conEspecialidad(Medico m) {
		Especialidad e = repo.especialidadPorId(m.especialidadId())
				.orElseThrow(() -> new IllegalStateException("Medico sin especialidad: " + m.id()));
		return new MedicoConEspecialidad(m, e);
	}

	private static RecursoNoEncontradoException noEncontrado(UUID id) {
		return new RecursoNoEncontradoException("MEDICO_NO_ENCONTRADO", "No existe el medico " + id);
	}
}
