package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import org.mapstruct.Mapper;

import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.domain.model.Paciente;

@Mapper(componentModel = "spring")
public interface PacienteWebMapper {

	CrearPacienteUseCase.Command toCommand(CrearPacienteRequest request);

	PacienteResponse toResponse(Paciente paciente);
}
