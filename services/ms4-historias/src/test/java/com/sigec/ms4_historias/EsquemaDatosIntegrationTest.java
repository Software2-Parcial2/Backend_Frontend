package com.sigec.ms4_historias;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Restricciones, inmutabilidad e indices de la migracion V3 contra un PostgreSQL real (docs/datos/postgresql.md). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EsquemaDatosIntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	private UUID historia() {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO historias_clinicas (id, paciente_id) VALUES (?, ?)", id, UUID.randomUUID());
		return id;
	}

	private UUID consulta(UUID historia, UUID cita) {
		UUID id = UUID.randomUUID();
		jdbc.update("INSERT INTO consultas (id, historia_id, medico_id, fecha, motivo, cita_id) VALUES (?, ?, ?, now(), 'control', ?)", id, historia, UUID.randomUUID(), cita);
		return id;
	}

	@Test
	void unaConsultaPorCitaPeroVariasSinCita() {
		UUID h = historia(), cita = UUID.randomUUID();
		consulta(h, cita);
		assertThatThrownBy(() -> consulta(h, cita)).isInstanceOf(DataIntegrityViolationException.class);
		consulta(h, null);
		consulta(h, null); // urgencias: sin cita, sin limite
	}

	@Test
	void laEvolucionEsInmutable() {
		UUID c = consulta(historia(), null);
		UUID e = UUID.randomUUID();
		jdbc.update("INSERT INTO evoluciones (id, consulta_id, medico_id, nota) VALUES (?, ?, ?, 'estable')", e, c, UUID.randomUUID());
		assertThatThrownBy(() -> jdbc.update("UPDATE evoluciones SET nota = 'otra' WHERE id = ?", e)).hasMessageContaining("solo anadir");
		assertThatThrownBy(() -> jdbc.update("DELETE FROM evoluciones WHERE id = ?", e)).hasMessageContaining("solo anadir");
	}

	@Test
	void laAuditoriaDeAccesosEsDeSoloAnadir() {
		jdbc.update("INSERT INTO auditoria_accesos (paciente_id, usuario_id, rol, accion, recurso) VALUES (?, 'u', 'medico', 'LEER', 'consulta')", UUID.randomUUID());
		assertThatThrownBy(() -> jdbc.update("DELETE FROM auditoria_accesos")).hasMessageContaining("solo anadir");
		assertThatThrownBy(() -> jdbc.update("INSERT INTO auditoria_accesos (paciente_id, usuario_id, rol, accion, recurso) VALUES (?, 'u', 'medico', 'BORRAR', 'x')", UUID.randomUUID()))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void unConsentimientoVigentePorTipoPeroSeConservanLosRevocados() {
		UUID p = UUID.randomUUID();
		jdbc.update("INSERT INTO consentimientos (id, paciente_id, tipo, version_texto) VALUES (?, ?, 'IMAGENES_IA', 'v1')", UUID.randomUUID(), p);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO consentimientos (id, paciente_id, tipo, version_texto) VALUES (?, ?, 'IMAGENES_IA', 'v1')", UUID.randomUUID(), p))
				.isInstanceOf(DataIntegrityViolationException.class);
		jdbc.update("UPDATE consentimientos SET revocado_en = now() WHERE paciente_id = ?", p);
		jdbc.update("INSERT INTO consentimientos (id, paciente_id, tipo, version_texto) VALUES (?, ?, 'IMAGENES_IA', 'v2')", UUID.randomUUID(), p);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM consentimientos WHERE paciente_id = ?", Integer.class, p)).isEqualTo(2);
	}
}
