package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.out.SolicitudRepositoryPort;
import com.sigec.ms2_pacientes.domain.exception.CursorInvalidoException;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion.Campo;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion.Estado;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;

@Component
public class SolicitudPersistenceAdapter implements SolicitudRepositoryPort {

	private final SolicitudJpaRepository repo;

	@PersistenceContext
	private EntityManager em;

	public SolicitudPersistenceAdapter(SolicitudJpaRepository repo) {
		this.repo = repo;
	}

	@Override
	public SolicitudActualizacion guardar(SolicitudActualizacion s) {
		SolicitudEntity e = new SolicitudEntity();
		e.setId(s.id());
		e.setPacienteId(s.pacienteId());
		e.setCampo(s.campo().name().toLowerCase());
		e.setValorActual(s.valorActual());
		e.setValorPropuesto(s.valorPropuesto());
		e.setEstado(s.estado());
		e.setMotivoRechazo(s.motivoRechazo());
		e.setSolicitadaEn(s.solicitadaEn());
		e.setResueltaEn(s.resueltaEn());
		e.setResueltaPor(s.resueltaPor());
		return aDominio(repo.saveAndFlush(e));
	}

	@Override
	public Optional<SolicitudActualizacion> porId(UUID id) {
		return repo.findById(id).map(SolicitudPersistenceAdapter::aDominio);
	}

	@Override
	public boolean hayPendiente(UUID pacienteId, Campo campo) {
		return repo.existsByPacienteIdAndCampoAndEstado(pacienteId, campo.name().toLowerCase(), Estado.PENDIENTE);
	}

	@Override
	public List<SolicitudActualizacion> porPaciente(UUID pacienteId) {
		return repo.findByPacienteIdOrderBySolicitadaEnDescIdDesc(pacienteId).stream().map(SolicitudPersistenceAdapter::aDominio).toList();
	}

	/** Mas recientes primero (solicitada_en, id) con cursor keyset. */
	@Override
	public Pagina<SolicitudActualizacion> listar(Estado estado, int limite, String cursor) {
		StringBuilder sql = new StringBuilder("SELECT s.* FROM solicitudes_actualizacion s WHERE 1 = 1");
		Map<String, Object> params = new LinkedHashMap<>();
		if (estado != null) {
			sql.append(" AND s.estado = :estado");
			params.put("estado", estado.name());
		}
		if (cursor != null && !cursor.isBlank()) {
			Map<String, String> clave = CursorCodec.decodificar(cursor, "t", "i");
			try {
				params.put("ct", Instant.parse(clave.get("t")));
				params.put("ci", UUID.fromString(clave.get("i")));
			}
			catch (RuntimeException e) {
				throw new CursorInvalidoException();
			}
			sql.append(" AND (s.solicitada_en, s.id) < (:ct, :ci)");
		}
		sql.append(" ORDER BY s.solicitada_en DESC, s.id DESC LIMIT :lim");
		params.put("lim", limite + 1);
		Query q = em.createNativeQuery(sql.toString(), SolicitudEntity.class);
		params.forEach(q::setParameter);
		@SuppressWarnings("unchecked")
		List<SolicitudEntity> filas = q.getResultList();
		boolean hayMas = filas.size() > limite;
		List<SolicitudActualizacion> items = new ArrayList<>(filas.subList(0, Math.min(filas.size(), limite)).stream()
				.map(SolicitudPersistenceAdapter::aDominio).toList());
		String siguiente = null;
		if (hayMas && !items.isEmpty()) {
			SolicitudActualizacion u = items.get(items.size() - 1);
			Map<String, String> clave = new LinkedHashMap<>();
			clave.put("t", u.solicitadaEn().toString());
			clave.put("i", u.id().toString());
			siguiente = CursorCodec.codificar(clave);
		}
		return new Pagina<>(items, siguiente);
	}

	private static SolicitudActualizacion aDominio(SolicitudEntity e) {
		return new SolicitudActualizacion(e.getId(), e.getPacienteId(), Campo.valueOf(e.getCampo().toUpperCase()), e.getValorActual(),
				e.getValorPropuesto(), e.getEstado(), e.getMotivoRechazo(), e.getSolicitadaEn(), e.getResueltaEn(), e.getResueltaPor());
	}
}
