package com.sigec.ms2_pacientes.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.domain.model.Medico;

public interface CatalogoRepositoryPort {

	List<Especialidad> especialidades(boolean soloActivas);

	Optional<Especialidad> especialidadPorId(UUID id);

	Optional<Especialidad> especialidadPorCodigo(String codigo);

	Especialidad guardarEspecialidad(Especialidad especialidad);

	List<Medico> medicos(UUID especialidadId, boolean soloActivos);

	Optional<Medico> medicoPorId(UUID id);

	Optional<Medico> medicoPorUsuario(String usuarioKeycloak);

	Medico guardarMedico(Medico medico);

	boolean existeMedicoPorDocumentoOMatricula(String documento, String matricula);
}
