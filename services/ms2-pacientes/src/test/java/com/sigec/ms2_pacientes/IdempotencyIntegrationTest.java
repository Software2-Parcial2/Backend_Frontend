package com.sigec.ms2_pacientes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class IdempotencyIntegrationTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	static RequestPostProcessor recepcion() {
		return jwt().jwt(j -> j.subject("recepcion-1")).authorities(new SimpleGrantedAuthority("ROLE_recepcion"));
	}

	/** Documento unico de <= 30 caracteres (limite de @Size). */
	static String doc(String prefijo) {
		return prefijo + "-" + UUID.randomUUID().toString().substring(0, 12);
	}

	static String paciente(String documento) {
		return "{\"nombre\":\"Ana\",\"documento\":\"" + documento + "\",\"fechaNacimiento\":\"1990-05-01\"}";
	}

	MvcResult crearPaciente(String key, String json) throws Exception {
		var req = post("/api/pacientes").with(recepcion()).contentType("application/json").content(json);
		if (key != null) {
			req.header("Idempotency-Key", key);
		}
		return mvc.perform(req).andReturn();
	}

	@BeforeEach
	void limpiar() {
		jdbc.update("DELETE FROM idempotency_keys");
		IdempotencyTestController.EXECUTIONS.set(0);
	}

	@Test
	void sinCabeceraDa400ProblemJson() throws Exception {
		MvcResult r = crearPaciente(null, paciente(doc("SC")));
		assertThat(r.getResponse().getStatus()).isEqualTo(400);
		assertThat(r.getResponse().getContentType()).startsWith("application/problem+json");
	}

	@Test
	void cabeceraQueNoEsUuidDa400() throws Exception {
		assertThat(crearPaciente("no-es-uuid", paciente(doc("NU"))).getResponse().getStatus()).isEqualTo(400);
	}

	@Test
	void sinTokenDa401AntesDeReservarClave() throws Exception {
		int status = mvc.perform(post("/api/pacientes").header("Idempotency-Key", UUID.randomUUID().toString())
				.contentType("application/json").content(paciente("X"))).andReturn().getResponse().getStatus();
		assertThat(status).isEqualTo(401);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idempotency_keys", Integer.class)).isZero();
	}

	@Test
	void repetirLaMismaPeticionDevuelveLaMismaRespuestaSinCrearOtroPaciente() throws Exception {
		String key = UUID.randomUUID().toString();
		String doc = doc("RP");
		MvcResult first = crearPaciente(key, paciente(doc));
		assertThat(first.getResponse().getStatus()).isEqualTo(201);
		assertThat(first.getResponse().getHeader("Idempotent-Replay")).isNull();

		MvcResult again = crearPaciente(key, paciente(doc));
		assertThat(again.getResponse().getStatus()).isEqualTo(201);
		assertThat(again.getResponse().getHeader("Idempotent-Replay")).isEqualTo("true");
		assertThat(again.getResponse().getContentAsString()).isEqualTo(first.getResponse().getContentAsString());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM pacientes WHERE documento = ?", Integer.class, doc)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE payload->>'documento' = ?", Integer.class, doc)).isEqualTo(1);
	}

	@Test
	void elOrdenDeLasClavesDelJsonNoCambiaLaHuella() throws Exception {
		String key = UUID.randomUUID().toString();
		String doc = doc("OK");
		crearPaciente(key, paciente(doc));
		String reordenado = "{\"fechaNacimiento\":\"1990-05-01\",\"documento\":\"" + doc + "\",\"nombre\":\"Ana\"}";
		assertThat(crearPaciente(key, reordenado).getResponse().getHeader("Idempotent-Replay")).isEqualTo("true");
	}

	@Test
	void mismaClaveConCuerpoDistintoDa422() throws Exception {
		String key = UUID.randomUUID().toString();
		crearPaciente(key, paciente(doc("D1")));
		MvcResult r = crearPaciente(key, paciente(doc("D2")));
		assertThat(r.getResponse().getStatus()).isEqualTo(422);
		assertThat(r.getResponse().getContentType()).startsWith("application/problem+json");
	}

	@Test
	void unErrorDeNegocio4xxSeGuardaYSeReproduce() throws Exception {
		String doc = doc("DUP");
		assertThat(crearPaciente(UUID.randomUUID().toString(), paciente(doc)).getResponse().getStatus()).isEqualTo(201);
		String key = UUID.randomUUID().toString();
		assertThat(crearPaciente(key, paciente(doc)).getResponse().getStatus()).isEqualTo(409); // documento duplicado
		MvcResult again = crearPaciente(key, paciente(doc));
		assertThat(again.getResponse().getStatus()).isEqualTo(409);
		assertThat(again.getResponse().getHeader("Idempotent-Replay")).isEqualTo("true");
	}

	@Test
	void dosPeticionesSimultaneasEjecutanUnaVezYLaOtraRecibe409ConRetryAfter() throws Exception {
		String key = UUID.randomUUID().toString();
		ExecutorService pool = Executors.newFixedThreadPool(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<MvcResult> call = () -> {
			start.await();
			return mvc.perform(post("/api/_test/slow").with(recepcion()).header("Idempotency-Key", key)
					.contentType("application/json").content("{}")).andReturn();
		};
		Future<MvcResult> a = pool.submit(call);
		Future<MvcResult> b = pool.submit(call);
		start.countDown();
		List<MvcResult> results = List.of(a.get(), b.get());
		pool.shutdown();

		assertThat(results.stream().map(r -> r.getResponse().getStatus()).sorted().toList()).containsExactly(200, 409);
		MvcResult conflict = results.stream().filter(r -> r.getResponse().getStatus() == 409).findFirst().orElseThrow();
		assertThat(conflict.getResponse().getHeader("Retry-After")).isEqualTo("1");
		assertThat(IdempotencyTestController.EXECUTIONS.get()).isEqualTo(1);
	}

	@Test
	void unaClaveVencidaSePuedeReutilizar() throws Exception {
		String key = UUID.randomUUID().toString();
		String doc = doc("EX");
		assertThat(crearPaciente(key, paciente(doc)).getResponse().getStatus()).isEqualTo(201);
		jdbc.update("UPDATE idempotency_keys SET expires_at = now() - interval '1 minute'");
		// Vencida: se trata como nueva. Como el paciente ya existe, la operacion se ejecuta de verdad y da 409.
		MvcResult r = crearPaciente(key, paciente(doc));
		assertThat(r.getResponse().getStatus()).isEqualTo(409);
		assertThat(r.getResponse().getHeader("Idempotent-Replay")).isNull();
	}

	@Test
	void unaRespuesta5xxLiberaLaClaveYElReintentoSeEjecuta() throws Exception {
		String key = UUID.randomUUID().toString();
		IdempotencyTestController.failNext = true;
		var req = post("/api/_test/flaky").with(recepcion()).header("Idempotency-Key", key).contentType("application/json").content("{}");
		assertThat(mvc.perform(req).andReturn().getResponse().getStatus()).isEqualTo(503);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM idempotency_keys WHERE key LIKE ?", Integer.class, "%" + key)).isZero();
		MvcResult retry = mvc.perform(req).andReturn();
		assertThat(retry.getResponse().getStatus()).isEqualTo(200);
		assertThat(retry.getResponse().getHeader("Idempotent-Replay")).isNull();
		assertThat(IdempotencyTestController.EXECUTIONS.get()).isEqualTo(2);
	}

	@Test
	void laClaveEstaAcotadaPorUsuario() throws Exception {
		String key = UUID.randomUUID().toString();
		String doc = doc("US");
		crearPaciente(key, paciente(doc));
		var otro = jwt().jwt(j -> j.subject("otro-usuario")).authorities(new SimpleGrantedAuthority("ROLE_recepcion"));
		MvcResult r = mvc.perform(post("/api/pacientes").with(otro).header("Idempotency-Key", key)
				.contentType("application/json").content(paciente(doc))).andReturn();
		// Para el otro usuario la clave es nueva: no ve la respuesta guardada del primero.
		assertThat(r.getResponse().getHeader("Idempotent-Replay")).isNull();
		assertThat(r.getResponse().getStatus()).isEqualTo(409);
	}
}
