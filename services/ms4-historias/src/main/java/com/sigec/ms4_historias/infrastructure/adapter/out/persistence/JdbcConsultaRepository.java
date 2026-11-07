package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.application.port.out.ConsultaRepositoryPort;
import com.sigec.ms4_historias.domain.exception.ConflictoException;
import com.sigec.ms4_historias.domain.exception.RecursoNoEncontradoException;
import com.sigec.ms4_historias.domain.exception.VersionConflictoException;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.EstadoConsulta;
import com.sigec.ms4_historias.domain.model.Evolucion;
import com.sigec.ms4_historias.domain.model.RecetaItem;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Repository
public class JdbcConsultaRepository implements ConsultaRepositoryPort {

	private final JdbcTemplate jdbc;
	private final ObjectMapper json;

	public JdbcConsultaRepository(JdbcTemplate jdbc, ObjectMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	private Consulta mapear(ResultSet rs, int i) throws SQLException {
		String signos = rs.getString("signos_vitales");
		Timestamp firmada = rs.getTimestamp("firmada_en");
		return new Consulta((UUID) rs.getObject("id"), (UUID) rs.getObject("historia_id"), (UUID) rs.getObject("medico_id"),
				(UUID) rs.getObject("cita_id"), rs.getTimestamp("fecha").toInstant(), rs.getString("motivo"), rs.getString("diagnostico"),
				rs.getString("tratamiento"), rs.getString("indicaciones"),
				signos == null ? null : json.readValue(signos, new TypeReference<Map<String, Object>>() {
				}), json.readValue(rs.getString("receta"), new TypeReference<List<RecetaItem>>() {
				}), EstadoConsulta.valueOf(rs.getString("estado")), firmada == null ? null : firmada.toInstant(),
				rs.getString("firmada_por"), rs.getLong("version"));
	}

	@Override
	public Optional<Consulta> porId(UUID id) {
		return jdbc.query("SELECT * FROM consultas WHERE id = ?", this::mapear, id).stream().findFirst();
	}

	@Override
	public Consulta insertar(Consulta c) {
		try {
			jdbc.update("""
					INSERT INTO consultas (id, historia_id, medico_id, cita_id, fecha, motivo, diagnostico, tratamiento, indicaciones,
					                       signos_vitales, receta, estado)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'BORRADOR')
					""", c.id(), c.historiaId(), c.medicoId(), c.citaId(), Timestamp.from(c.fecha()), c.motivo(), c.diagnostico(),
					c.tratamiento(), c.indicaciones(), c.signosVitales() == null ? null : json.writeValueAsString(c.signosVitales()),
					json.writeValueAsString(c.receta()));
		}
		catch (DuplicateKeyException e) {
			throw new ConflictoException("CONSULTA_YA_EXISTE", "La cita ya tiene una consulta");
		}
		return porId(c.id()).orElseThrow();
	}

	@Override
	public Consulta actualizar(Consulta c, long versionEsperada) {
		int filas = jdbc.update("""
				UPDATE consultas SET motivo = ?, diagnostico = ?, tratamiento = ?, indicaciones = ?, signos_vitales = ?::jsonb,
				       receta = ?::jsonb, estado = ?, firmada_en = ?, firmada_por = ?, version = version + 1
				 WHERE id = ? AND version = ?
				""", c.motivo(), c.diagnostico(), c.tratamiento(), c.indicaciones(),
				c.signosVitales() == null ? null : json.writeValueAsString(c.signosVitales()), json.writeValueAsString(c.receta()),
				c.estado().name(), c.firmadaEn() == null ? null : Timestamp.from(c.firmadaEn()), c.firmadaPor(), c.id(), versionEsperada);
		if (filas == 0) {
			long vigente = jdbc.query("SELECT version FROM consultas WHERE id = ?", (rs, i) -> rs.getLong(1), c.id()).stream().findFirst()
					.orElseThrow(() -> new RecursoNoEncontradoException("CONSULTA_NO_ENCONTRADA", "No existe la consulta"));
			throw new VersionConflictoException(vigente);
		}
		return porId(c.id()).orElseThrow();
	}

	@Override
	public Pagina<Consulta> pagina(UUID historiaId, EstadoConsulta estado, int limite, String cursor) {
		StringBuilder sql = new StringBuilder("SELECT * FROM consultas WHERE historia_id = ?");
		List<Object> args = new ArrayList<>();
		args.add(historiaId);
		if (estado != null) {
			sql.append(" AND estado = ?");
			args.add(estado.name());
		}
		if (cursor != null) {
			Map<String, String> c = CursorCodec.decodificar(cursor, "f", "id");
			Timestamp f;
			UUID id;
			try {
				f = Timestamp.from(Instant.parse(c.get("f")));
				id = UUID.fromString(c.get("id"));
			}
			catch (RuntimeException e) {
				throw new com.sigec.ms4_historias.domain.exception.CursorInvalidoException();
			}
			sql.append(" AND (fecha, id) < (?, ?)");
			args.add(f);
			args.add(id);
		}
		sql.append(" ORDER BY fecha DESC, id DESC LIMIT ?");
		args.add(limite + 1);
		List<Consulta> filas = jdbc.query(sql.toString(), this::mapear, args.toArray());
		if (filas.size() <= limite) {
			return new Pagina<>(filas, null);
		}
		List<Consulta> items = filas.subList(0, limite);
		Consulta ultima = items.get(limite - 1);
		return new Pagina<>(List.copyOf(items), CursorCodec.codificar(Map.of("f", ultima.fecha().toString(), "id", ultima.id().toString())));
	}

	@Override
	public Evolucion agregarEvolucion(Evolucion e) {
		jdbc.update("INSERT INTO evoluciones (id, consulta_id, medico_id, fecha, nota) VALUES (?, ?, ?, ?, ?)", e.id(), e.consultaId(),
				e.medicoId(), Timestamp.from(e.fecha()), e.nota());
		return e;
	}

	@Override
	public List<Evolucion> evoluciones(UUID consultaId) {
		return jdbc.query("SELECT * FROM evoluciones WHERE consulta_id = ? ORDER BY fecha, id",
				(rs, i) -> new Evolucion((UUID) rs.getObject("id"), (UUID) rs.getObject("consulta_id"), (UUID) rs.getObject("medico_id"),
						rs.getTimestamp("fecha").toInstant(), rs.getString("nota")),
				consultaId);
	}
}
