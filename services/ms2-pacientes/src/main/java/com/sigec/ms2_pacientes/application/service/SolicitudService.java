package com.sigec.ms2_pacientes.application.service;

import java.util.UUID;
import java.util.regex.Pattern;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.SolicitudesUseCase;
import com.sigec.ms2_pacientes.application.port.out.EventPublisherPort;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.application.port.out.SolicitudRepositoryPort;
import com.sigec.ms2_pacientes.domain.event.PacienteActualizado;
import com.sigec.ms2_pacientes.domain.exception.ConflictoException;
import com.sigec.ms2_pacientes.domain.exception.PacienteNoEncontradoException;
import com.sigec.ms2_pacientes.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms2_pacientes.domain.model.Paciente;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion.Campo;

/** Solicitudes de actualizacion de datos de contacto: el paciente pide, recepcion decide. Nombre y documento no se piden por aqui. */
public class SolicitudService implements SolicitudesUseCase {

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

	private final SolicitudRepositoryPort solicitudes;
	private final PacienteRepositoryPort pacientes;
	private final EventPublisherPort eventos;

	public SolicitudService(SolicitudRepositoryPort solicitudes, PacienteRepositoryPort pacientes, EventPublisherPort eventos) {
		this.solicitudes = solicitudes;
		this.pacientes = pacientes;
		this.eventos = eventos;
	}

	@Override
	public SolicitudActualizacion solicitar(UUID pacienteId, Campo campo, String valorPropuesto) {
		Paciente p = pacientes.buscarPorId(pacienteId).orElseThrow(() -> new PacienteNoEncontradoException(pacienteId));
		String valor = valorPropuesto == null ? "" : valorPropuesto.strip();
		if (valor.isEmpty() || valor.length() > (campo == Campo.DIRECCION ? 300 : campo == Campo.EMAIL ? 200 : 30)) {
			throw new IllegalArgumentException("El valor propuesto esta vacio o es demasiado largo");
		}
		if (campo == Campo.EMAIL && !EMAIL.matcher(valor).matches()) {
			throw new IllegalArgumentException("El correo propuesto no es valido");
		}
		if (solicitudes.hayPendiente(pacienteId, campo)) {
			throw new ConflictoException("SOLICITUD_PENDIENTE", "Ya hay una solicitud pendiente para ese dato");
		}
		return solicitudes.guardar(SolicitudActualizacion.crear(pacienteId, campo, p.contacto(campo), valor));
	}

	@Override
	public Pagina<SolicitudActualizacion> listar(SolicitudActualizacion.Estado estado, int limite, String cursor) {
		return solicitudes.listar(estado, limite, cursor);
	}

	@Override
	public Pagina<SolicitudActualizacion> deUnPaciente(UUID pacienteId) {
		pacientes.buscarPorId(pacienteId).orElseThrow(() -> new PacienteNoEncontradoException(pacienteId));
		return Pagina.unica(solicitudes.porPaciente(pacienteId));
	}

	@Override
	public SolicitudActualizacion aprobar(UUID solicitudId, String usuario) {
		SolicitudActualizacion s = cargar(solicitudId).aprobar(usuario);
		Paciente p = pacientes.buscarPorId(s.pacienteId()).orElseThrow(() -> new PacienteNoEncontradoException(s.pacienteId()));
		Paciente guardado = pacientes.guardar(p.conContacto(s.campo(), s.valorPropuesto()));
		eventos.publicar(PacienteActualizado.de(guardado));
		return solicitudes.guardar(s);
	}

	@Override
	public SolicitudActualizacion rechazar(UUID solicitudId, String usuario, String motivo) {
		return solicitudes.guardar(cargar(solicitudId).rechazar(usuario, motivo == null || motivo.isBlank() ? null : motivo.strip()));
	}

	private SolicitudActualizacion cargar(UUID id) {
		return solicitudes.porId(id).orElseThrow(() -> new RecursoNoEncontradoException("SOLICITUD_NO_ENCONTRADA", "No existe la solicitud " + id));
	}
}
