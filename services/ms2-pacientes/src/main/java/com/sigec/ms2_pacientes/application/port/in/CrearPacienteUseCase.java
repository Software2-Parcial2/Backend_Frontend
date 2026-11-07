package com.sigec.ms2_pacientes.application.port.in;

import java.time.LocalDate;

import com.sigec.ms2_pacientes.domain.model.Paciente;
import com.sigec.ms2_pacientes.domain.model.Sexo;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

public interface CrearPacienteUseCase {

	Paciente crear(Command command);

	record Command(String nombre, String documento, LocalDate fechaNacimiento, Sexo sexo, String telefono, String email,
			String direccion, boolean beca, TipoSeguro tipoSeguro, String usuarioSub) {
	}
}
