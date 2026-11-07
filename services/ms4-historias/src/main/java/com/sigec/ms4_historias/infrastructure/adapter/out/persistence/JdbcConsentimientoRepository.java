package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.port.out.ConsentimientoRepositoryPort;
import com.sigec.ms4_historias.domain.exception.ConflictoException;
import com.sigec.ms4_historias.domain.model.Consentimiento;
import com.sigec.ms4_historias.domain.model.TipoConsentimiento;

@Repository
public class JdbcConsentimientoRepository implements ConsentimientoRepositoryPort {

	private final JdbcTemplate jdbc;

	public JdbcConsentimientoRepository(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	private static Consentimiento mapear(ResultSet rs, int i) throws SQLException {
		Timestamp rev = rs.getTimestamp("revocado_en");
		return new Consentimiento((UUID) rs.getObject("id"), (UUID) rs.getObject("paciente_id"), TipoConsentimiento.valueOf(rs.getString("tipo")),
				rs.getString("version_texto"), rs.getTimestamp("otorgado_en").toInstant(), rev == null ? null : rev.toInstant());
	}

	@Override
	public Optional<Consentimiento> porId(UUID id) {
		return jdbc.query("SELECT * FROM consentimientos WHERE id = ?", JdbcConsentimientoRepository::mapear, id).stream().findFirst();
	}

	@Override
	public List<Consentimiento> porPaciente(UUID pacienteId) {
		return jdbc.query("SELECT * FROM consentimientos WHERE paciente_id = ? ORDER BY otorgado_en DESC, id", JdbcConsentimientoRepository::mapear,
				pacienteId);
	}

	@Override
	public Consentimiento insertar(Consentimiento c) {
		try {
			jdbc.update("INSERT INTO consentimientos (id, paciente_id, tipo, version_texto, otorgado_en) VALUES (?, ?, ?, ?, ?)", c.id(),
					c.pacienteId(), c.tipo().name(), c.versionTexto(), Timestamp.from(c.otorgadoEn()));
		}
		catch (DuplicateKeyException e) {
			throw new ConflictoException("CONSENTIMIENTO_VIGENTE", "Ya hay un consentimiento vigente de este tipo");
		}
		return porId(c.id()).orElseThrow();
	}

	@Override
	public Consentimiento revocar(UUID id) {
		jdbc.update("UPDATE consentimientos SET revocado_en = now() WHERE id = ? AND revocado_en IS NULL", id);
		return porId(id).orElseThrow();
	}
}
