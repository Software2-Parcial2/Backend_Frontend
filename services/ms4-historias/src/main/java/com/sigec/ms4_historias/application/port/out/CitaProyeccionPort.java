package com.sigec.ms4_historias.application.port.out;

import java.util.Optional;
import java.util.UUID;

import com.sigec.ms4_historias.domain.model.CitaProyectada;

public interface CitaProyeccionPort {

	Optional<CitaProyectada> porId(UUID citaId);

	/** Una confirmacion que llega tarde no pisa un estado posterior (cancelada, llego...). */
	void confirmar(CitaProyectada cita);

	/** Fija el estado (cancelada, llego, atendida, no asistio); crea la fila si la confirmacion aun no llego. */
	void fijarEstado(CitaProyectada cita);
}
