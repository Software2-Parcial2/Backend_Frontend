package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.sigec.ms4_historias.domain.exception.ReglaNegocioException;
import com.sigec.ms4_historias.domain.exception.ConflictoException;

/** Consulta clinica: borrador editable hasta que el medico la firma; firmada ya no se modifica. */
public record Consulta(UUID id, UUID historiaId, UUID medicoId, UUID citaId, Instant fecha, String motivo, String diagnostico,
		String tratamiento, String indicaciones, Map<String, Object> signosVitales, List<RecetaItem> receta, EstadoConsulta estado,
		Instant firmadaEn, String firmadaPor, long version) {

	public static Consulta nueva(UUID historiaId, UUID medicoId, UUID citaId, Instant fecha, String motivo, Map<String, Object> signos) {
		if (motivo == null || motivo.isBlank()) {
			throw new ReglaNegocioException("MOTIVO_REQUERIDO", "La consulta necesita un motivo");
		}
		return new Consulta(UUID.randomUUID(), historiaId, medicoId, citaId, fecha, motivo.strip(), null, null, null, signos, List.of(),
				EstadoConsulta.BORRADOR, null, null, 0);
	}

	public boolean firmada() {
		return estado == EstadoConsulta.FIRMADA;
	}

	/** Reemplaza el contenido clinico (solo borrador). */
	public Consulta editar(String motivo, String diagnostico, String tratamiento, String indicaciones, Map<String, Object> signos,
			List<RecetaItem> receta) {
		exigirBorrador();
		if (motivo == null || motivo.isBlank()) {
			throw new ReglaNegocioException("MOTIVO_REQUERIDO", "La consulta necesita un motivo");
		}
		return new Consulta(id, historiaId, medicoId, citaId, fecha, motivo.strip(), blancoANulo(diagnostico), blancoANulo(tratamiento),
				blancoANulo(indicaciones), signos, receta == null ? List.of() : List.copyOf(receta), estado, null, null, version);
	}

	public Consulta firmar(String usuario, Instant ahora) {
		exigirBorrador();
		if (diagnostico == null || diagnostico.isBlank()) {
			throw new ReglaNegocioException("DIAGNOSTICO_REQUERIDO", "No se puede firmar una consulta sin diagnostico");
		}
		return new Consulta(id, historiaId, medicoId, citaId, fecha, motivo, diagnostico, tratamiento, indicaciones, signosVitales, receta,
				EstadoConsulta.FIRMADA, ahora, usuario, version);
	}

	private void exigirBorrador() {
		if (firmada()) {
			throw new ConflictoException("CONSULTA_FIRMADA", "La consulta ya esta firmada; anada una evolucion");
		}
	}

	private static String blancoANulo(String s) {
		return s == null || s.isBlank() ? null : s.strip();
	}
}
