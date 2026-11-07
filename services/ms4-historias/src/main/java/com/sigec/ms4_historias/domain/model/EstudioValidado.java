package com.sigec.ms4_historias.domain.model;

import java.time.Instant;
import java.util.UUID;

/** Estudio de imagen cuyo informe valido (o descarto) un medico en MS5. El contenido vive en MS5. */
public record EstudioValidado(UUID imagenId, UUID pacienteId, String estudio, String decision, String validacion, UUID medicoId, Instant validadoEn,
		String huella, String versionModelo) {
}
