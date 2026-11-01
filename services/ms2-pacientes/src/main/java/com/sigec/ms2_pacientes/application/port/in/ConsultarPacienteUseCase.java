package com.sigec.ms2_pacientes.application.port.in;

import java.util.List;
import java.util.UUID;

import com.sigec.ms2_pacientes.domain.model.Paciente;

public interface ConsultarPacienteUseCase {

	Paciente porId(UUID id);

	List<Paciente> listar();
}
