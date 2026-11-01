package com.sigec.ms2_pacientes.application.port.in;

import java.time.LocalDate;

import com.sigec.ms2_pacientes.domain.model.Paciente;

public interface CrearPacienteUseCase {

	Paciente crear(Command command);

	record Command(String nombre, String documento, LocalDate fechaNacimiento, String telefono, String email) {
	}
}
