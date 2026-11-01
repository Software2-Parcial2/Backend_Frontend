package com.sigec.ms2_pacientes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** El rol paciente solo puede leer su propio registro (claim paciente_id); el personal ve a todos. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class PacienteAutorizacionIntegrationTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	static RequestPostProcessor como(String rol, String pacienteId) {
		return jwt().jwt(j -> {
			j.subject("u-" + rol);
			if (pacienteId != null) {
				j.claim("paciente_id", pacienteId);
			}
		}).authorities(new SimpleGrantedAuthority("ROLE_" + rol));
	}

	UUID crear(String doc) throws Exception {
		String body = mvc.perform(post("/api/pacientes").with(como("recepcion", null)).header("Idempotency-Key", UUID.randomUUID().toString())
				.contentType("application/json")
				.content("{\"nombre\":\"Ana\",\"documento\":\"" + doc + "\",\"fechaNacimiento\":\"1990-05-01\"}"))
				.andReturn().getResponse().getContentAsString();
		return UUID.fromString(body.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1"));
	}

	@Test
	void elPacienteLeeSoloSuPropioRegistro() throws Exception {
		UUID suyo = crear("PA-" + UUID.randomUUID().toString().substring(0, 12));
		UUID ajeno = crear("PB-" + UUID.randomUUID().toString().substring(0, 12));

		assertThat(mvc.perform(get("/api/pacientes/" + suyo).with(como("paciente", suyo.toString()))).andReturn().getResponse().getStatus()).isEqualTo(200);
		assertThat(mvc.perform(get("/api/pacientes/" + ajeno).with(como("paciente", suyo.toString()))).andReturn().getResponse().getStatus()).isEqualTo(403);
	}

	@Test
	void unPacienteSinVinculoNoLeeNadaYNoPuedeListarNiCrear() throws Exception {
		UUID id = crear("PC-" + UUID.randomUUID().toString().substring(0, 12));
		assertThat(mvc.perform(get("/api/pacientes/" + id).with(como("paciente", null))).andReturn().getResponse().getStatus()).isEqualTo(403);
		assertThat(mvc.perform(get("/api/pacientes").with(como("paciente", id.toString()))).andReturn().getResponse().getStatus()).isEqualTo(403);
		assertThat(mvc.perform(post("/api/pacientes").with(como("paciente", id.toString())).header("Idempotency-Key", UUID.randomUUID().toString())
				.contentType("application/json").content("{}")).andReturn().getResponse().getStatus()).isEqualTo(403);
	}

	@Test
	void elPersonalVeATodos() throws Exception {
		UUID id = crear("PD-" + UUID.randomUUID().toString().substring(0, 12));
		for (String rol : new String[] { "administrador", "recepcion", "medico" }) {
			assertThat(mvc.perform(get("/api/pacientes/" + id).with(como(rol, null))).andReturn().getResponse().getStatus()).isEqualTo(200);
		}
	}
}
