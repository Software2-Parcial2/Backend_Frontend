package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.port.out.CitaProyeccionPort;
import com.sigec.ms4_historias.domain.model.CitaProyectada;

@Repository
public class JdbcCitaProyeccion implements CitaProyeccionPort {

	private final JdbcTemplate jdbc;

	public JdbcCitaProyeccion(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<CitaProyectada> porId(UUID citaId) {
		return jdbc.query("SELECT * FROM citas_proyeccion WHERE cita_id = ?",
				(rs, i) -> new CitaProyectada((UUID) rs.getObject("cita_id"), (UUID) rs.getObject("paciente_id"), (UUID) rs.getObject("medico_id"),
						rs.getTimestamp("fecha_hora").toInstant(), rs.getString("estado")),
				citaId).stream().findFirst();
	}

	@Override
	public void confirmar(CitaProyectada c) {
		jdbc.update("""
				INSERT INTO citas_proyeccion (cita_id, paciente_id, medico_id, fecha_hora, estado) VALUES (?, ?, ?, ?, 'CONFIRMADA')
				ON CONFLICT (cita_id) DO NOTHING
				""", c.citaId(), c.pacienteId(), c.medicoId(), Timestamp.from(c.fechaHora()));
	}

	@Override
	public void fijarEstado(CitaProyectada c) {
		jdbc.update("""
				INSERT INTO citas_proyeccion (cita_id, paciente_id, medico_id, fecha_hora, estado) VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (cita_id) DO UPDATE SET estado = EXCLUDED.estado, fecha_hora = EXCLUDED.fecha_hora, actualizado = now()
				""", c.citaId(), c.pacienteId(), c.medicoId(), Timestamp.from(c.fechaHora()), c.estado());
	}
}
