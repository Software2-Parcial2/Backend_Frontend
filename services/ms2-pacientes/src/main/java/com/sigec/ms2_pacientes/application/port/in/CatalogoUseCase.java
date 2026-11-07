package com.sigec.ms2_pacientes.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.domain.model.Medico;

/** Catalogo maestro de especialidades y medicos (lo consumen MS3, MS4, MS6 y los frontends). */
public interface CatalogoUseCase {

	List<Especialidad> especialidades(boolean soloActivas);

	Especialidad crearEspecialidad(String codigo, String nombre);

	Especialidad actualizarEspecialidad(UUID id, String nombre, boolean activa);

	/** Medicos, opcionalmente de una especialidad (por codigo). */
	List<MedicoConEspecialidad> medicos(String especialidadCodigo, boolean soloActivos);

	MedicoConEspecialidad medico(UUID id);

	MedicoConEspecialidad medicoPorUsuario(String usuarioKeycloak);

	MedicoConEspecialidad crearMedico(MedicoCommand c);

	MedicoConEspecialidad actualizarMedico(UUID id, MedicoCommand c, boolean activo);

	record MedicoConEspecialidad(Medico medico, Especialidad especialidad) {
	}

	record MedicoCommand(String nombre, String documento, String matricula, String especialidadCodigo, String email, String telefono,
			String usuarioKeycloak, String consultorio) {
	}
}
