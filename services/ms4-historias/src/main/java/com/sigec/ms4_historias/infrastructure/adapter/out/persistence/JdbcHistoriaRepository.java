package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.port.out.HistoriaRepositoryPort;
import com.sigec.ms4_historias.domain.model.Historia;

@Repository
public class JdbcHistoriaRepository implements HistoriaRepositoryPort {

	static final RowMapper<Historia> MAPPER = (rs, i) -> mapear(rs);

	private final JdbcTemplate jdbc;

	public JdbcHistoriaRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static Historia mapear(ResultSet rs) throws SQLException {
		return new Historia((UUID) rs.getObject("id"), (UUID) rs.getObject("paciente_id"), rs.getString("numero_historia"),
				rs.getString("paciente_nombre"), rs.getTimestamp("created_at").toInstant(), rs.getLong("version"));
	}

	@Override
	public Optional<Historia> porId(UUID id) {
		return jdbc.query("SELECT * FROM historias_clinicas WHERE id = ?", MAPPER, id).stream().findFirst();
	}

	@Override
	public Optional<Historia> porPacienteId(UUID pacienteId) {
		return jdbc.query("SELECT * FROM historias_clinicas WHERE paciente_id = ?", MAPPER, pacienteId).stream().findFirst();
	}

	@Override
	public void guardarIdentificacion(UUID pacienteId, String numeroHistoria, String nombre) {
		jdbc.update("""
				INSERT INTO historias_clinicas (id, paciente_id, numero_historia, paciente_nombre)
				VALUES (?, ?, ?, ?)
				ON CONFLICT (paciente_id) DO UPDATE
				   SET numero_historia = COALESCE(EXCLUDED.numero_historia, historias_clinicas.numero_historia),
				       paciente_nombre = COALESCE(EXCLUDED.paciente_nombre, historias_clinicas.paciente_nombre)
				""", UUID.randomUUID(), pacienteId, numeroHistoria, nombre);
	}
}
