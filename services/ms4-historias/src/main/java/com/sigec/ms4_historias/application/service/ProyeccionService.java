package com.sigec.ms4_historias.application.service;

import java.time.Instant;
import java.util.UUID;

import com.sigec.ms4_historias.application.port.in.ProyeccionesUseCase;
import com.sigec.ms4_historias.application.port.out.CitaProyeccionPort;
import com.sigec.ms4_historias.application.port.out.EstudioProyeccionPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.model.CitaProyectada;

public class ProyeccionService implements ProyeccionesUseCase {

	private final HistoriaRepositoryPort historias;
	private final CitaProyeccionPort citas;
	private final EstudioProyeccionPort estudios;

	public ProyeccionService(HistoriaRepositoryPort historias, CitaProyeccionPort citas, EstudioProyeccionPort estudios) {
		this.estudios = estudios;
		this.historias = historias;
		this.citas = citas;
	}

	@Override
	public void pacienteRegistrado(UUID pacienteId, String numeroHistoria, String nombre) {
		historias.guardarIdentificacion(pacienteId, numeroHistoria, nombre);
	}

	@Override
	public void citaConfirmada(UUID citaId, UUID pacienteId, UUID medicoId, Instant fechaHora) {
		citas.confirmar(new CitaProyectada(citaId, pacienteId, medicoId, fechaHora, "CONFIRMADA"));
	}

	@Override
	public void citaCambiada(UUID citaId, UUID pacienteId, UUID medicoId, Instant fechaHora, String estado) {
		citas.fijarEstado(new CitaProyectada(citaId, pacienteId, medicoId, fechaHora, estado));
	}

	@Override
	public void estudioValidado(com.sigec.ms4_historias.domain.model.EstudioValidado estudio) {
		estudios.guardar(estudio);
	}
}
