package com.sigec.ms4_historias.application;

import java.util.UUID;

/** Quien hace la peticion: lo extrae el adaptador web del JWT. {@code rol} es el de mayor privilegio del usuario. */
public record Actor(String usuarioId, String rol, UUID pacienteId, UUID medicoId) {

	public boolean esMedico() {
		return "medico".equals(rol);
	}

	public boolean esPaciente() {
		return "paciente".equals(rol);
	}
}
