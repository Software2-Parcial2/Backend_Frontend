package com.sigec.ms4_historias.application.port.in;

import java.time.Instant;
import java.util.UUID;

/** Reaccion a los eventos de otros servicios (los llama el consumidor de RabbitMQ). */
public interface ProyeccionesUseCase {

	/** paciente.creado / paciente.actualizado: crea la historia o actualiza su identificacion. */
	void pacienteRegistrado(UUID pacienteId, String numeroHistoria, String nombre);

	void citaConfirmada(UUID citaId, UUID pacienteId, UUID medicoId, Instant fechaHora);

	/** estado: CANCELADA, LLEGO, ATENDIDA o NO_ASISTIO. */
	void citaCambiada(UUID citaId, UUID pacienteId, UUID medicoId, Instant fechaHora, String estado);
}
