package com.sigec.ms4_historias.application.port.in;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.sigec.ms4_historias.application.Actor;
import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.EstadoConsulta;
import com.sigec.ms4_historias.domain.model.Evolucion;
import com.sigec.ms4_historias.domain.model.RecetaItem;

public interface ConsultasUseCase {

	record Iniciar(UUID citaId, String motivo, Map<String, Object> signosVitales) {
	}

	record Contenido(String motivo, String diagnostico, String tratamiento, String indicaciones, Map<String, Object> signosVitales,
			List<RecetaItem> receta) {
	}

	/** Receta para imprimir: identificacion + lineas; solo de consultas firmadas. */
	record Receta(UUID consultaId, java.time.Instant fecha, UUID medicoId, String pacienteNombre, String numeroHistoria,
			List<RecetaItem> items, String indicaciones, java.time.Instant firmadaEn) {
	}

	Consulta iniciar(Actor actor, UUID historiaId, Iniciar cmd);

	Consulta porId(Actor actor, UUID consultaId);

	Pagina<Consulta> listar(Actor actor, UUID historiaId, EstadoConsulta estado, int limite, String cursor);

	Consulta editar(Actor actor, UUID consultaId, long version, Contenido contenido);

	/** {@code version} puede ser null (sin If-Match): firma lo vigente. */
	Consulta firmar(Actor actor, UUID consultaId, Long version);

	Evolucion agregarEvolucion(Actor actor, UUID consultaId, String nota);

	List<Evolucion> evoluciones(Actor actor, UUID consultaId);

	Receta receta(Actor actor, UUID consultaId);
}
