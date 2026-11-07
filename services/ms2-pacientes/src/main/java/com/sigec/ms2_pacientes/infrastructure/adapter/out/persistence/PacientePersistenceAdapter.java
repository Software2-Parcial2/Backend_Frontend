package com.sigec.ms2_pacientes.infrastructure.adapter.out.persistence;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase.Busqueda;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase.Tipo;
import com.sigec.ms2_pacientes.application.port.out.PacienteRepositoryPort;
import com.sigec.ms2_pacientes.domain.model.Paciente;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;

@Component
public class PacientePersistenceAdapter implements PacienteRepositoryPort {

	private static final Pattern NO_ALFANUMERICO = Pattern.compile("[^\\p{L}\\p{N}]+");

	private final PacienteJpaRepository repository;
	private final PacientePersistenceMapper mapper;

	@PersistenceContext
	private EntityManager em;

	public PacientePersistenceAdapter(PacienteJpaRepository repository, PacientePersistenceMapper mapper) {
		this.repository = repository;
		this.mapper = mapper;
	}

	@Override
	public Paciente guardar(Paciente paciente) {
		return mapper.toDomain(repository.saveAndFlush(mapper.toEntity(paciente)));
	}

	@Override
	public Optional<Paciente> buscarPorId(UUID id) {
		return repository.findById(id).map(mapper::toDomain);
	}

	@Override
	public Optional<Paciente> buscarPorUsuarioSub(String sub) {
		return repository.findByUsuarioSub(sub).map(mapper::toDomain);
	}

	@Override
	public boolean existePorDocumento(String documento) {
		return repository.existsByDocumento(documento);
	}

	@Override
	public boolean existePorUsuarioSub(String sub) {
		return repository.existsByUsuarioSub(sub);
	}

	@Override
	public String siguienteNumeroHistoria() {
		Number n = (Number) em.createNativeQuery("SELECT nextval('seq_numero_historia')").getSingleResult();
		return "HC-" + String.format("%06d", n.longValue());
	}

	/**
	 * Busqueda por palabras: cada palabra del nombre debe aparecer en el nombre normalizado foneticamente (sigec_fonetica),
	 * asi «Rohas Carla» encuentra a «Carla Rojas». Documento por prefijo; historia por numero. Orden estable (nombre, id) con cursor keyset.
	 */
	@Override
	public Pagina<Paciente> buscar(Busqueda b) {
		StringBuilder sql = new StringBuilder("SELECT p.* FROM pacientes p WHERE 1 = 1");
		Map<String, Object> params = new LinkedHashMap<>();
		String q = b.q() == null ? "" : b.q().strip();
		if (!q.isEmpty()) {
			Tipo tipo = b.tipo() == null ? Tipo.NOMBRE : b.tipo();
			switch (tipo) {
				case NOMBRE -> {
					int i = 0;
					for (String palabra : NO_ALFANUMERICO.split(Normalizer.normalize(q, Normalizer.Form.NFC))) {
						if (palabra.isBlank()) {
							continue;
						}
						sql.append(" AND p.nombre_fonetico LIKE '%' || sigec_fonetica(:t").append(i).append(") || '%'");
						params.put("t" + i, palabra);
						i++;
					}
				}
				case DOCUMENTO -> {
					sql.append(" AND p.documento ILIKE :doc");
					params.put("doc", q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
				}
				case HISTORIA -> {
					String digitos = q.replaceAll("\\D", "");
					if (digitos.isEmpty() || digitos.length() > 6) {
						sql.append(" AND 1 = 0");
					}
					else {
						sql.append(" AND p.numero_historia = :hc");
						params.put("hc", "HC-" + "0".repeat(6 - digitos.length()) + digitos);
					}
				}
			}
		}
		if (b.cursor() != null && !b.cursor().isBlank()) {
			Map<String, String> clave = CursorCodec.decodificar(b.cursor(), "n", "i");
			sql.append(" AND (p.nombre, p.id) > (:cn, :ci)");
			params.put("cn", clave.get("n"));
			try {
				params.put("ci", UUID.fromString(clave.get("i")));
			}
			catch (IllegalArgumentException e) {
				throw new com.sigec.ms2_pacientes.domain.exception.CursorInvalidoException();
			}
		}
		sql.append(" ORDER BY p.nombre, p.id LIMIT :lim");
		params.put("lim", b.limite() + 1);

		Query query = em.createNativeQuery(sql.toString(), PacienteEntity.class);
		params.forEach(query::setParameter);
		@SuppressWarnings("unchecked")
		List<PacienteEntity> filas = query.getResultList();
		boolean hayMas = filas.size() > b.limite();
		List<Paciente> items = new ArrayList<>(filas.subList(0, Math.min(filas.size(), b.limite())).stream().map(mapper::toDomain).toList());
		String siguiente = null;
		if (hayMas && !items.isEmpty()) {
			Paciente ultimo = items.get(items.size() - 1);
			Map<String, String> clave = new LinkedHashMap<>();
			clave.put("n", ultimo.nombre());
			clave.put("i", ultimo.id().toString());
			siguiente = CursorCodec.codificar(clave);
		}
		return new Pagina<>(items, siguiente);
	}
}
