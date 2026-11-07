package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.port.out.AntecedenteRepositoryPort;
import com.sigec.ms4_historias.domain.exception.VersionConflictoException;
import com.sigec.ms4_historias.domain.model.Antecedente;
import com.sigec.ms4_historias.domain.model.TipoAntecedente;

@Repository
public class JdbcAntecedenteRepository implements AntecedenteRepositoryPort {

	private final JdbcTemplate jdbc;

	public JdbcAntecedenteRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static Antecedente mapear(ResultSet rs, int i) throws SQLException {
		return new Antecedente((UUID) rs.getObject("id"), (UUID) rs.getObject("historia_id"), TipoAntecedente.valueOf(rs.getString("tipo")),
				rs.getString("descripcion"), rs.getBoolean("activo"), rs.getTimestamp("created_at").toInstant(), rs.getLong("version"));
	}

	@Override
	public Optional<Antecedente> porId(UUID id) {
		return jdbc.query("SELECT * FROM antecedentes WHERE id = ?", JdbcAntecedenteRepository::mapear, id).stream().findFirst();
	}

	@Override
	public List<Antecedente> porHistoria(UUID historiaId, boolean soloActivos) {
		return jdbc.query("SELECT * FROM antecedentes WHERE historia_id = ?" + (soloActivos ? " AND activo" : "") + " ORDER BY tipo, created_at, id",
				JdbcAntecedenteRepository::mapear, historiaId);
	}

	@Override
	public Antecedente insertar(Antecedente a) {
		jdbc.update("INSERT INTO antecedentes (id, historia_id, tipo, descripcion, activo, created_at) VALUES (?, ?, ?, ?, ?, ?)", a.id(),
				a.historiaId(), a.tipo().name(), a.descripcion(), a.activo(), Timestamp.from(a.creado()));
		return porId(a.id()).orElseThrow();
	}

	@Override
	public Antecedente actualizar(Antecedente a, long versionEsperada) {
		int filas = jdbc.update("UPDATE antecedentes SET descripcion = ?, activo = ?, version = version + 1 WHERE id = ? AND version = ?",
				a.descripcion(), a.activo(), a.id(), versionEsperada);
		if (filas == 0) {
			throw new VersionConflictoException(porId(a.id()).map(Antecedente::version).orElse(versionEsperada));
		}
		return porId(a.id()).orElseThrow();
	}
}
