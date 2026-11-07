package com.sigec.ms4_historias.application.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.application.port.in.ConsultasUseCase;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.application.port.out.CitaProyeccionPort;
import com.sigec.ms4_historias.application.port.out.ConsultaRepositoryPort;
import com.sigec.ms4_historias.application.port.out.EventPublisherPort;
import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.event.ConsultaFirmada;
import com.sigec.ms4_historias.domain.exception.AccesoDenegadoException;
import com.sigec.ms4_historias.domain.exception.ConflictoException;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.exception.ReglaNegocioException;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.CitaProyectada;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.EstadoConsulta;
import com.sigec.ms4_historias.domain.model.Evolucion;
import com.sigec.ms4_historias.domain.model.Historia;

public class ConsultaService implements ConsultasUseCase {

	private final HistoriaRepositoryPort historias;
	private final ConsultaRepositoryPort consultas;
	private final CitaProyeccionPort citas;
	private final AuditoriaPort auditoria;
	private final EventPublisherPort events;

	public ConsultaService(HistoriaRepositoryPort historias, ConsultaRepositoryPort consultas, CitaProyeccionPort citas,
			AuditoriaPort auditoria, EventPublisherPort events) {
		this.historias = historias;
		this.consultas = consultas;
		this.citas = citas;
		this.auditoria = auditoria;
		this.events = events;
	}

	@Override
	public Consulta iniciar(Actor actor, UUID historiaId, Iniciar cmd) {
		Acceso.exigirMedico(actor);
		Historia h = historia(historiaId);
		if (actor.medicoId() == null) {
			throw new ReglaNegocioException("MEDICO_NO_VINCULADO", "Su usuario no esta vinculado a un medico del catalogo");
		}
		if (cmd.citaId() != null) {
			validarCita(cmd.citaId(), h, actor);
		}
		Consulta c = consultas.insertar(Consulta.nueva(h.id(), actor.medicoId(), cmd.citaId(), Instant.now(), cmd.motivo(), cmd.signosVitales()));
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.CREAR, "CONSULTA");
		return c;
	}

	private void validarCita(UUID citaId, Historia h, Actor actor) {
		CitaProyectada cita = citas.porId(citaId)
				.orElseThrow(() -> new ReglaNegocioException("CITA_NO_HABILITADA", "La cita no esta confirmada o no se conoce aun"));
		if (!cita.pacienteId().equals(h.pacienteId())) {
			throw new ReglaNegocioException("CITA_NO_CORRESPONDE", "La cita es de otro paciente");
		}
		if (!cita.medicoId().equals(actor.medicoId())) {
			throw new ReglaNegocioException("CITA_DE_OTRO_MEDICO", "La cita esta asignada a otro medico");
		}
		if (!cita.habilitaConsulta()) {
			throw new ReglaNegocioException("CITA_NO_HABILITADA", "La cita esta " + cita.estado() + " y no permite iniciar la consulta");
		}
	}

	@Override
	public Consulta porId(Actor actor, UUID consultaId) {
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		Acceso.exigirLectura(actor, h);
		if (actor.esPaciente() && !c.firmada()) {
			throw new RecursoNoEncontradoException("CONSULTA_NO_ENCONTRADA", "No existe la consulta");
		}
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "CONSULTA");
		return c;
	}

	@Override
	public Pagina<Consulta> listar(Actor actor, UUID historiaId, EstadoConsulta estado, int limite, String cursor) {
		Historia h = historia(historiaId);
		Acceso.exigirLectura(actor, h);
		// El paciente solo ve lo firmado.
		EstadoConsulta filtro = actor.esPaciente() ? EstadoConsulta.FIRMADA : estado;
		Pagina<Consulta> p = consultas.pagina(h.id(), filtro, limite, cursor);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "CONSULTAS");
		return p;
	}

	@Override
	public Consulta editar(Actor actor, UUID consultaId, long version, Contenido k) {
		Acceso.exigirMedico(actor);
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		Consulta editada = c.editar(k.motivo(), k.diagnostico(), k.tratamiento(), k.indicaciones(), k.signosVitales(), k.receta());
		Consulta guardada = consultas.actualizar(editada, version);
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.MODIFICAR, "CONSULTA");
		return guardada;
	}

	@Override
	public Consulta firmar(Actor actor, UUID consultaId, Long version) {
		Acceso.exigirMedico(actor);
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		if (actor.medicoId() == null || !actor.medicoId().equals(c.medicoId())) {
			throw new AccesoDenegadoException("SOLO_AUTOR_FIRMA", "Solo el medico que atendio puede firmar la consulta");
		}
		Consulta firmada = consultas.actualizar(c.firmar(actor.usuarioId(), Instant.now()), version != null ? version : c.version());
		events.publicar(ConsultaFirmada.de(firmada, h.pacienteId()));
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.MODIFICAR, "CONSULTA_FIRMA");
		return firmada;
	}

	@Override
	public Evolucion agregarEvolucion(Actor actor, UUID consultaId, String nota) {
		Acceso.exigirMedico(actor);
		if (nota == null || nota.isBlank()) {
			throw new ReglaNegocioException("NOTA_REQUERIDA", "La evolucion necesita una nota");
		}
		if (actor.medicoId() == null) {
			throw new ReglaNegocioException("MEDICO_NO_VINCULADO", "Su usuario no esta vinculado a un medico del catalogo");
		}
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		Evolucion e = consultas.agregarEvolucion(new Evolucion(UUID.randomUUID(), c.id(), actor.medicoId(), Instant.now(), nota.strip()));
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.CREAR, "EVOLUCION");
		return e;
	}

	@Override
	public List<Evolucion> evoluciones(Actor actor, UUID consultaId) {
		Acceso.exigirMedico(actor);
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.LEER, "EVOLUCION");
		return consultas.evoluciones(c.id());
	}

	@Override
	public Receta receta(Actor actor, UUID consultaId) {
		Consulta c = consulta(consultaId);
		Historia h = historia(c.historiaId());
		Acceso.exigirLectura(actor, h);
		if (!c.firmada()) {
			throw new ConflictoException("CONSULTA_NO_FIRMADA", "La receta solo se emite de una consulta firmada");
		}
		auditoria.registrar(h.pacienteId(), h.id(), actor.usuarioId(), actor.rol(), Accion.EXPORTAR, "RECETA");
		return new Receta(c.id(), c.fecha(), c.medicoId(), h.pacienteNombre(), h.numeroHistoria(), c.receta(), c.indicaciones(), c.firmadaEn());
	}

	private Historia historia(UUID id) {
		return historias.porId(id).orElseThrow(Acceso::historiaNoEncontrada);
	}

	private Consulta consulta(UUID id) {
		return consultas.porId(id).orElseThrow(() -> new RecursoNoEncontradoException("CONSULTA_NO_ENCONTRADA", "No existe la consulta"));
	}
}
