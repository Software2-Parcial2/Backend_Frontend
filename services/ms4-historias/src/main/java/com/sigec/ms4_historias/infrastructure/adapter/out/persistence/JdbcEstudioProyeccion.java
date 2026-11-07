package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.port.out.EstudioProyeccionPort;
import com.sigec.ms4_historias.domain.model.EstudioValidado;

@Repository
public class JdbcEstudioProyeccion implements EstudioProyeccionPort {

	private final JdbcTemplate jdbc;

	public JdbcEstudioProyeccion(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void guardar(EstudioValidado e) {
		jdbc.update("""
				INSERT INTO estudios_proyeccion (imagen_id, paciente_id, estudio, decision, validacion, medico_id, validado_en, huella, version_modelo)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (imagen_id) DO NOTHING
				""", e.imagenId(), e.pacienteId(), e.estudio(), e.decision(), e.validacion(), e.medicoId(), Timestamp.from(e.validadoEn()), e.huella(),
				e.versionModelo());
	}

	@Override
	public List<EstudioValidado> porPaciente(UUID pacienteId, boolean soloValidados) {
		return jdbc.query("SELECT * FROM estudios_proyeccion WHERE paciente_id = ?" + (soloValidados ? " AND validacion = 'VALIDADO'" : "")
				+ " ORDER BY validado_en DESC, imagen_id",
				(rs, i) -> new EstudioValidado((UUID) rs.getObject("imagen_id"), (UUID) rs.getObject("paciente_id"), rs.getString("estudio"),
						rs.getString("decision"), rs.getString("validacion"), (UUID) rs.getObject("medico_id"), rs.getTimestamp("validado_en").toInstant(),
						rs.getString("huella"), rs.getString("version_modelo")),
				pacienteId);
	}
}
