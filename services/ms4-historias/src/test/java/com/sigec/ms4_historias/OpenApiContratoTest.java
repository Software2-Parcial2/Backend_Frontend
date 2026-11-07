package com.sigec.ms4_historias;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * El contrato REST versionado (contracts/openapi/ms4-historias.json) debe coincidir con el que genera springdoc desde el codigo.
 * Regenerar con: OPENAPI_UPDATE=1 ./mvnw test -Dtest=OpenApiContratoTest
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class OpenApiContratoTest {

	static final String NOMBRE = "ms4-historias";

	@Autowired MockMvc mvc;
	final ObjectMapper mapper = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build();

	@SuppressWarnings("unchecked")
	static Object ordenar(Object v) {
		if (v instanceof Map<?, ?> m) {
			Map<String, Object> t = new TreeMap<>();
			m.forEach((k, x) -> t.put(String.valueOf(k), ordenar(x)));
			return new LinkedHashMap<>(t);
		}
		if (v instanceof List<?> l) {
			List<Object> r = new ArrayList<>();
			l.forEach(x -> r.add(ordenar(x)));
			return r;
		}
		return v;
	}

	@Test
	void elContratoVersionadoCoincideConElCodigo() throws Exception {
		String crudo = mvc.perform(get("/v3/api-docs")).andReturn().getResponse().getContentAsString();
		String generado = mapper.writeValueAsString(ordenar(mapper.readValue(crudo, Object.class))) + "\n";
		Path archivo = Path.of("../../contracts/openapi/" + NOMBRE + ".json");
		if ("1".equals(System.getenv("OPENAPI_UPDATE"))) {
			Files.createDirectories(archivo.getParent());
			Files.writeString(archivo, generado);
			return;
		}
		assertThat(archivo).as("Falta %s: generalo con OPENAPI_UPDATE=1", archivo).exists();
		assertThat(Files.readString(archivo)).as("El contrato %s se desvio del codigo", NOMBRE).isEqualTo(generado);
	}
}
