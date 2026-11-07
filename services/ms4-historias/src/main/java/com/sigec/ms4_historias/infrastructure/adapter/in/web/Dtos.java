package com.sigec.ms4_historias.infrastructure.adapter.in.web;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.application.port.in.ConsultasUseCase;
import com.sigec.ms4_historias.domain.model.AccesoAuditado;
import com.sigec.ms4_historias.domain.model.Antecedente;
import com.sigec.ms4_historias.domain.model.Consentimiento;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.Evolucion;
import com.sigec.ms4_historias.domain.model.Historia;
import com.sigec.ms4_historias.domain.model.RecetaItem;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Cuerpos de entrada y salida de la API (camelCase; fechas ISO-8601 UTC). */
final class Dtos {

	private Dtos() {
	}

	record PaginaResponse<T>(List<T> items, String siguiente) {
		static <D, T> PaginaResponse<T> de(Pagina<D> p, java.util.function.Function<D, T> f) {
			return new PaginaResponse<>(p.items().stream().map(f).toList(), p.siguiente());
		}
	}

	record HistoriaResponse(UUID id, UUID pacienteId, String numeroHistoria, String pacienteNombre, Instant creada, long version) {
		static HistoriaResponse de(Historia h) {
			return new HistoriaResponse(h.id(), h.pacienteId(), h.numeroHistoria(), h.pacienteNombre(), h.creada(), h.version());
		}
	}

	record RecetaItemDto(@NotBlank @Size(max = 200) String medicamento, @Size(max = 100) String dosis, @Size(max = 100) String frecuencia,
			@Size(max = 100) String duracion) {
		RecetaItem aDominio() {
			return new RecetaItem(medicamento, dosis, frecuencia, duracion);
		}
	}

	record IniciarConsultaRequest(UUID citaId, @NotBlank @Size(max = 2000) String motivo, Map<String, Object> signosVitales) {
	}

	record EditarConsultaRequest(@NotBlank @Size(max = 2000) String motivo, @Size(max = 4000) String diagnostico,
			@Size(max = 4000) String tratamiento, @Size(max = 4000) String indicaciones, Map<String, Object> signosVitales,
			@Valid @Size(max = 50) List<RecetaItemDto> receta) {
		ConsultasUseCase.Contenido aDominio() {
			return new ConsultasUseCase.Contenido(motivo, diagnostico, tratamiento, indicaciones, signosVitales,
					receta == null ? List.of() : receta.stream().map(RecetaItemDto::aDominio).toList());
		}
	}

	record ConsultaResponse(UUID id, UUID historiaId, UUID medicoId, UUID citaId, Instant fecha, String motivo, String diagnostico,
			String tratamiento, String indicaciones, Map<String, Object> signosVitales, List<RecetaItem> receta, String estado,
			Instant firmadaEn, long version) {
		static ConsultaResponse de(Consulta c) {
			return new ConsultaResponse(c.id(), c.historiaId(), c.medicoId(), c.citaId(), c.fecha(), c.motivo(), c.diagnostico(), c.tratamiento(),
					c.indicaciones(), c.signosVitales(), c.receta(), c.estado().name(), c.firmadaEn(), c.version());
		}
	}

	record EvolucionRequest(@NotBlank @Size(max = 4000) String nota) {
	}

	record EvolucionResponse(UUID id, UUID consultaId, UUID medicoId, Instant fecha, String nota) {
		static EvolucionResponse de(Evolucion e) {
			return new EvolucionResponse(e.id(), e.consultaId(), e.medicoId(), e.fecha(), e.nota());
		}
	}

	record RecetaResponse(UUID consultaId, Instant fecha, UUID medicoId, String pacienteNombre, String numeroHistoria, List<RecetaItem> items,
			String indicaciones, Instant firmadaEn) {
		static RecetaResponse de(ConsultasUseCase.Receta r) {
			return new RecetaResponse(r.consultaId(), r.fecha(), r.medicoId(), r.pacienteNombre(), r.numeroHistoria(), r.items(), r.indicaciones(),
					r.firmadaEn());
		}
	}

	record AntecedenteRequest(@NotNull String tipo, @NotBlank @Size(max = 2000) String descripcion) {
	}

	record AntecedenteEdicionRequest(@NotBlank @Size(max = 2000) String descripcion, Boolean activo) {
	}

	record AntecedenteResponse(UUID id, UUID historiaId, String tipo, String descripcion, boolean activo, Instant creado, long version) {
		static AntecedenteResponse de(Antecedente a) {
			return new AntecedenteResponse(a.id(), a.historiaId(), a.tipo().name(), a.descripcion(), a.activo(), a.creado(), a.version());
		}
	}

	record ConsentimientoRequest(@NotNull String tipo, @Size(max = 20) String versionTexto) {
	}

	record ConsentimientoResponse(UUID id, UUID pacienteId, String tipo, String versionTexto, Instant otorgadoEn, Instant revocadoEn, boolean vigente) {
		static ConsentimientoResponse de(Consentimiento c) {
			return new ConsentimientoResponse(c.id(), c.pacienteId(), c.tipo().name(), c.versionTexto(), c.otorgadoEn(), c.revocadoEn(), c.vigente());
		}
	}

	record AccesoResponse(long id, UUID pacienteId, UUID historiaId, String usuarioId, String rol, String accion, String recurso, Instant ocurridoEn) {
		static AccesoResponse de(AccesoAuditado a) {
			return new AccesoResponse(a.id(), a.pacienteId(), a.historiaId(), a.usuarioId(), a.rol(), a.accion().name(), a.recurso(), a.ocurridoEn());
		}
	}
}
