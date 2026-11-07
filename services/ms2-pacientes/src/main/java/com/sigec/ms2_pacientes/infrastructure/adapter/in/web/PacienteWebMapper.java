package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.time.LocalDate;
import java.time.Period;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.port.in.ActualizarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;
import com.sigec.ms2_pacientes.domain.model.Paciente;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

@Component
public class PacienteWebMapper {

	public CrearPacienteUseCase.Command toCommand(CrearPacienteRequest r) {
		return new CrearPacienteUseCase.Command(r.nombre(), r.documento(), r.fechaNacimiento(), r.sexo(), r.telefono(), r.email(),
				r.direccion(), Boolean.TRUE.equals(r.beca()), r.tipoSeguro() == null ? TipoSeguro.NINGUNO : r.tipoSeguro(), r.usuarioSub());
	}

	public ActualizarPacienteUseCase.Command toCommand(ActualizarPacienteRequest r) {
		return new ActualizarPacienteUseCase.Command(r.nombre(), r.fechaNacimiento(), r.sexo(), r.telefono(), r.email(), r.direccion(),
				Boolean.TRUE.equals(r.beca()), r.tipoSeguro() == null ? TipoSeguro.NINGUNO : r.tipoSeguro());
	}

	public PacienteResponse toResponse(Paciente p) {
		return new PacienteResponse(p.id(), p.numeroHistoria(), p.nombre(), p.documento(), p.fechaNacimiento(),
				Period.between(p.fechaNacimiento(), LocalDate.now()).getYears(), p.sexo(), p.telefono(), p.email(), p.direccion(),
				p.beca(), p.tipoSeguro(), p.version() == null ? 0 : p.version(), p.createdAt(), p.updatedAt());
	}

	public ContactoResponse toResponse(ContactoEmergencia c) {
		return new ContactoResponse(c.id(), c.pacienteId(), c.nombre(), c.parentesco(), c.telefono());
	}
}
