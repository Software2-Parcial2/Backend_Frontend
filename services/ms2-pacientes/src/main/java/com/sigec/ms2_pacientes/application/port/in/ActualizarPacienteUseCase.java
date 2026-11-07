package com.sigec.ms2_pacientes.application.port.in;

import java.time.LocalDate;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Paciente;
import com.sigec.ms2_pacientes.domain.model.Sexo;
import com.sigec.ms2_pacientes.domain.model.TipoSeguro;

public interface ActualizarPacienteUseCase {

	/** Aplica los cambios si {@code versionEsperada} coincide con la vigente; si no, VersionConflictoException. */
	Paciente actualizar(UUID id, long versionEsperada, Command command);

	record Command(String nombre, LocalDate fechaNacimiento, Sexo sexo, String telefono, String email, String direccion, boolean beca,
			TipoSeguro tipoSeguro) {
	}
}
