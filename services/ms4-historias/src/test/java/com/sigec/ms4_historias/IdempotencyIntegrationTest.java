package com.sigec.ms4_historias;

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

	static RequestPostProcessor medico() {
		return jwt().jwt(j -> j.subject("medico-1")).authorities(new SimpleGrantedAuthority("ROLE_medico"));
	}

	MvcResult enviar(String path, String key, String json) throws Exception {
		var req = post(path).with(medico()).contentType("application/json").content(json);
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
		MvcResult r = enviar("/api/_test/flaky", null, "{}");
		assertThat(r.getResponse().getStatus()).isEqualTo(400);
		assertThat(r.getResponse().getContentType()).startsWith("application/problem+json");
	}

	@Test
	void repetirDevuelveLaMismaRespuestaSinEjecutarOtraVez() throws Exception {
		String key = UUID.randomUUID().toString();
		MvcResult first = enviar("/api/_test/flaky", key, "{\"a\":1,\"b\":2}");
		assertThat(first.getResponse().getStatus()).isEqualTo(200);
		MvcResult again = enviar("/api/_test/flaky", key, "{\"b\":2,\"a\":1}");
		assertThat(again.getResponse().getHeader("Idempotent-Replay")).isEqualTo("true");
		assertThat(again.getResponse().getContentAsString()).isEqualTo(first.getResponse().getContentAsString());
		assertThat(IdempotencyTestController.EXECUTIONS.get()).isEqualTo(1);
	}

	@Test
	void hashDistintoDa422() throws Exception {
		String key = UUID.randomUUID().toString();
		enviar("/api/_test/flaky", key, "{\"a\":1}");
		assertThat(enviar("/api/_test/flaky", key, "{\"a\":2}").getResponse().getStatus()).isEqualTo(422);
	}

	@Test
	void simultaneasEjecutanUnaVezYLaOtraRecibe409() throws Exception {
		String key = UUID.randomUUID().toString();
		ExecutorService pool = Executors.newFixedThreadPool(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<MvcResult> call = () -> {
			start.await();
			return enviar("/api/_test/slow", key, "{}");
		};
		Future<MvcResult> a = pool.submit(call);
		Future<MvcResult> b = pool.submit(call);
		start.countDown();
		List<MvcResult> results = List.of(a.get(), b.get());
		pool.shutdown();
		assertThat(results.stream().map(r -> r.getResponse().getStatus()).sorted().toList()).containsExactly(200, 409);
		assertThat(IdempotencyTestController.EXECUTIONS.get()).isEqualTo(1);
	}

	@Test
	void unaClaveVencidaSeReutiliza() throws Exception {
		String key = UUID.randomUUID().toString();
		enviar("/api/_test/flaky", key, "{}");
		jdbc.update("UPDATE idempotency_keys SET expires_at = now() - interval '1 minute'");
		MvcResult r = enviar("/api/_test/flaky", key, "{}");
		assertThat(r.getResponse().getHeader("Idempotent-Replay")).isNull();
		assertThat(IdempotencyTestController.EXECUTIONS.get()).isEqualTo(2);
	}

	@Test
	void un5xxLiberaLaClave() throws Exception {
		String key = UUID.randomUUID().toString();
		IdempotencyTestController.failNext = true;
		assertThat(enviar("/api/_test/flaky", key, "{}").getResponse().getStatus()).isEqualTo(503);
		MvcResult retry = enviar("/api/_test/flaky", key, "{}");
		assertThat(retry.getResponse().getStatus()).isEqualTo(200);
		assertThat(retry.getResponse().getHeader("Idempotent-Replay")).isNull();
	}
}
