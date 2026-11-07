package com.sigec.ms4_historias;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Convencion de errores de SIGEC (docs/api.md): problem+json con code estable, errors por campo y correlationId. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class ErroresProblemJsonIntegrationTest {

	@Autowired MockMvc mvc;
	final ObjectMapper json = new ObjectMapper();

	static RequestPostProcessor como(String rol) {
		return jwt().jwt(j -> j.subject("u-" + rol)).authorities(new SimpleGrantedAuthority("ROLE_" + rol));
	}

	JsonNode cuerpo(MockHttpServletResponse r) throws Exception {
		assertThat(r.getContentType()).startsWith("application/problem+json");
		return json.readTree(r.getContentAsString());
	}

	@Test
	void noEncontradoTieneCodeDeDominio() throws Exception {
		MockHttpServletResponse r = mvc.perform(get("/api/historias/" + UUID.randomUUID()).with(como("medico"))).andReturn().getResponse();
		JsonNode p = cuerpo(r);
		assertThat(r.getStatus()).isEqualTo(404);
		assertThat(p.get("code").asString()).isEqualTo("HISTORIA_NO_ENCONTRADA");
	}

	@Test
	void sinTokenEs401ProblemJson() throws Exception {
		MockHttpServletResponse r = mvc.perform(get("/api/historias")).andReturn().getResponse();
		JsonNode p = cuerpo(r);
		assertThat(r.getStatus()).isEqualTo(401);
		assertThat(p.get("code").asString()).isEqualTo("NO_AUTENTICADO");
	}

	@Test
	void laRespuestaSiempreLlevaXCorrelationId() throws Exception {
		MockHttpServletResponse r = mvc.perform(get("/api/historias").with(como("recepcion"))).andReturn().getResponse();
		assertThat(r.getHeader("X-Correlation-Id")).isNotBlank();
	}
}
