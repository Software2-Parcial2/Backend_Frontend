package com.sigec.ms4_historias.application.service;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.domain.exception.AccesoDenegadoException;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.model.Historia;

/** Reglas de acceso a la historia: el medico accede a todas; el paciente solo a la suya; los demas roles no. */
final class Acceso {

	private Acceso() {
	}

	static RecursoNoEncontradoException historiaNoEncontrada() {
		return new RecursoNoEncontradoException("HISTORIA_NO_ENCONTRADA", "No existe la historia clinica");
	}

	/** Solo el medico (escribe y lee). */
	static void exigirMedico(Actor actor) {
		if (!actor.esMedico()) {
			throw new AccesoDenegadoException("ROL_SIN_ACCESO", "Su rol no puede acceder al contenido clinico");
		}
	}

	/** Medico o el propio paciente; para un paciente ajeno la historia «no existe» (404). */
	static void exigirLectura(Actor actor, Historia historia) {
		if (actor.esMedico()) {
			return;
		}
		if (actor.esPaciente()) {
			if (actor.pacienteId() != null && actor.pacienteId().equals(historia.pacienteId())) {
				return;
			}
			throw historiaNoEncontrada();
		}
		throw new AccesoDenegadoException("ROL_SIN_ACCESO", "Su rol no puede acceder al contenido clinico");
	}
}
