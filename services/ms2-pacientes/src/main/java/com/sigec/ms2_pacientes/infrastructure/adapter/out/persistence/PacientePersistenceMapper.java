package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import org.mapstruct.Mapper;

import com.sigec.ms2_pacientes.domain.model.Paciente;

@Mapper(componentModel = "spring")
public interface PacientePersistenceMapper {

	PacienteEntity toEntity(Paciente paciente);

	Paciente toDomain(PacienteEntity entity);
}
