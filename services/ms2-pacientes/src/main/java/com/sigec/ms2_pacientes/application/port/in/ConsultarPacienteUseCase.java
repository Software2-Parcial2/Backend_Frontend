package com.sigec.ms2_pacientes.application.port.in;

import java.util.UUID;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.domain.model.Paciente;

public interface ConsultarPacienteUseCase {

	Paciente porId(UUID id);

	/** El paciente vinculado a un usuario de Keycloak (sub). */
	Paciente porUsuarioSub(String sub);

	Pagina<Paciente> buscar(Busqueda busqueda);

	/** Que se busca: nombre (fonetico), documento (prefijo) o numero de historia. {@code q} vacio lista todo. */
	enum Tipo { NOMBRE, DOCUMENTO, HISTORIA }

	record Busqueda(String q, Tipo tipo, int limite, String cursor) {
	}
}
