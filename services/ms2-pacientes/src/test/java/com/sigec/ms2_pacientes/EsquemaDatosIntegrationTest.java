package com.sigec.ms2_pacientes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Restricciones e indices de la migracion V3 contra un PostgreSQL real (docs/datos/postgresql.md). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EsquemaDatosIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private UUID especialidad(String codigo) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO especialidades (id, codigo, nombre) VALUES (?, ?, ?)", id, codigo, codigo);
		return id;
	}

	@Test
	void medicoExigeEspecialidadExistenteYDocumentoUnico() {
		UUID esp = especialidad("test_" + UUID.randomUUID().toString().substring(0, 8).replace("-", ""));
		String doc = "D" + UUID.randomUUID().toString().substring(0, 12);
		jdbc.update("INSERT INTO medicos (id, nombre, documento, matricula, especialidad_id) VALUES (?, 'Dra. Prueba', ?, ?, ?)",
				UUID.randomUUID(), doc, "M" + UUID.randomUUID().toString().substring(0, 12), esp);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO medicos (id, nombre, documento, matricula, especialidad_id) VALUES (?, 'X', ?, ?, ?)",
				UUID.randomUUID(), doc, "M" + UUID.randomUUID().toString().substring(0, 12), esp)).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO medicos (id, nombre, documento, matricula, especialidad_id) VALUES (?, 'X', ?, ?, ?)",
				UUID.randomUUID(), "E" + UUID.randomUUID().toString().substring(0, 12), "M" + UUID.randomUUID().toString().substring(0, 12), UUID.randomUUID()))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void codigoDeEspecialidadSoloMinusculas() {
		assertThatThrownBy(() -> especialidad("Cardiologia")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void pacienteTraeValoresPorDefectoYValidaSeguro() {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO pacientes (id, nombre, documento, fecha_nacimiento) VALUES (?, 'Ana', ?, DATE '1990-05-01')", id, "P" + id.toString().substring(0, 12));
		assertThat(jdbc.queryForObject("SELECT tipo_seguro FROM pacientes WHERE id = ?", String.class, id)).isEqualTo("NINGUNO");
		assertThat(jdbc.queryForObject("SELECT beca FROM pacientes WHERE id = ?", Boolean.class, id)).isFalse();
		assertThatThrownBy(() -> jdbc.update("UPDATE pacientes SET tipo_seguro = 'OTRO' WHERE id = ?", id)).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void purgaTecnicaBorraSoloOutboxPublicadoAntiguoEIdempotenciaVencida() {
		UUID viejo = UUID.randomUUID(), pendiente = UUID.randomUUID();
		jdbc.update("INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, published_at) VALUES (?, 'x', ?, 't', '{}'::jsonb, now() - interval '10 days')", viejo, UUID.randomUUID());
		jdbc.update("INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload) VALUES (?, 'x', ?, 't', '{}'::jsonb)", pendiente, UUID.randomUUID());
		jdbc.queryForList("SELECT * FROM purgar_tecnico()");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE id = ?", Integer.class, viejo)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE id = ?", Integer.class, pendiente)).isEqualTo(1);
	}
}
