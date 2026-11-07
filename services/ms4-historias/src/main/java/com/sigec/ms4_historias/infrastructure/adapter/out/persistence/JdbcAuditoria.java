package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.application.port.out.AuditoriaPort;
import com.sigec.ms4_historias.domain.exception.CursorInvalidoException;
import com.sigec.ms4_historias.domain.model.AccesoAuditado;
import com.sigec.ms4_historias.domain.model.Accion;

@Repository
public class JdbcAuditoria implements AuditoriaPort {

	private final JdbcTemplate jdbc;

	public JdbcAuditoria(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void registrar(UUID pacienteId, UUID historiaId, String usuarioId, String rol, Accion accion, String recurso) {
		jdbc.update("INSERT INTO auditoria_accesos (paciente_id, historia_id, usuario_id, rol, accion, recurso) VALUES (?, ?, ?, ?, ?, ?)",
				pacienteId, historiaId, usuarioId, rol, accion.name(), recurso);
	}

	@Override
	public Pagina<AccesoAuditado> pagina(UUID historiaId, Accion accion, int limite, String cursor) {
		StringBuilder sql = new StringBuilder("SELECT * FROM auditoria_accesos WHERE historia_id = ?");
		List<Object> args = new ArrayList<>();
		args.add(historiaId);
		if (accion != null) {
			sql.append(" AND accion = ?");
			args.add(accion.name());
		}
		if (cursor != null) {
			long id;
			try {
				id = Long.parseLong(CursorCodec.decodificar(cursor, "id").get("id"));
			}
			catch (NumberFormatException e) {
				throw new CursorInvalidoException();
			}
			sql.append(" AND id < ?");
			args.add(id);
		}
		sql.append(" ORDER BY id DESC LIMIT ?");
		args.add(limite + 1);
		List<AccesoAuditado> filas = jdbc.query(sql.toString(),
				(rs, i) -> new AccesoAuditado(rs.getLong("id"), (UUID) rs.getObject("paciente_id"), (UUID) rs.getObject("historia_id"),
						rs.getString("usuario_id"), rs.getString("rol"), Accion.valueOf(rs.getString("accion")), rs.getString("recurso"),
						rs.getTimestamp("ocurrido_en").toInstant()),
				args.toArray());
		if (filas.size() <= limite) {
			return new Pagina<>(filas, null);
		}
		List<AccesoAuditado> items = List.copyOf(filas.subList(0, limite));
		return new Pagina<>(items, CursorCodec.codificar(Map.of("id", String.valueOf(items.get(limite - 1).id()))));
	}
}
