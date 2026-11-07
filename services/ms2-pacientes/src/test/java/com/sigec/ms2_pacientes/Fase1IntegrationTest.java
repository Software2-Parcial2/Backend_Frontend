package com.sigec.ms2_pacientes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Fase 1: busqueda, edicion con version, contactos, solicitudes de actualizacion y catalogo (docs/api.md). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class Fase1IntegrationTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	final ObjectMapper json = new ObjectMapper();

	static RequestPostProcessor como(String rol, String pacienteId) {
		return jwt().jwt(j -> {
			j.subject("u-" + rol);
			j.claim("preferred_username", rol);
			if (pacienteId != null) j.claim("paciente_id", pacienteId);
		}).authorities(new SimpleGrantedAuthority("ROLE_" + rol));
	}

	MockHttpServletResponse ejecutar(MockHttpServletRequestBuilder b) throws Exception {
		return mvc.perform(b).andReturn().getResponse();
	}

	MockHttpServletRequestBuilder conClave(MockHttpServletRequestBuilder b) {
		return b.header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json");
	}

	JsonNode ok(MockHttpServletResponse r, int esperado) throws Exception {
		assertThat(r.getStatus()).as(r.getContentAsString()).isEqualTo(esperado);
		return json.readTree(r.getContentAsString());
	}

	String unico() {
		return UUID.randomUUID().toString().substring(0, 8);
	}

	JsonNode crearPaciente(String nombre, String doc) throws Exception {
		return ok(ejecutar(conClave(post("/api/pacientes").with(como("recepcion", null)))
				.content("{\"nombre\":\"" + nombre + "\",\"documento\":\"" + doc + "\",\"fechaNacimiento\":\"1992-04-12\",\"sexo\":\"F\","
						+ "\"telefono\":\"7612-3045\",\"email\":\"a@b.com\",\"direccion\":\"Av. Banzer\"}")), 201);
	}

	@Test
	void crearAsignaNumeroDeHistoriaYDevuelveEdadYEtag() throws Exception {
		MockHttpServletResponse r = ejecutar(conClave(post("/api/pacientes").with(como("recepcion", null)))
				.content("{\"nombre\":\"Daniela Flores\",\"documento\":\"D" + unico() + "\",\"fechaNacimiento\":\"1998-06-09\"}"));
		JsonNode p = ok(r, 201);
		assertThat(p.get("numeroHistoria").asString()).matches("HC-\\d{6}");
		assertThat(p.get("edad").asInt()).isGreaterThan(20);
		assertThat(p.get("version").asLong()).isZero();
		assertThat(r.getHeader("ETag")).isEqualTo("\"0\"");
		// el evento incluye el numero de historia (lo proyectan MS3 y MS4)
		String payload = jdbc.queryForObject("SELECT payload::text FROM outbox WHERE aggregate_id = ?::uuid AND event_type = 'paciente.creado'",
				String.class, p.get("id").asString());
		assertThat(payload).contains(p.get("numeroHistoria").asString());
	}

	@Test
	void busquedaFoneticaTildesYPalabrasSueltas() throws Exception {
		String marca = "Zzq" + unico().replace("-", "");
		crearPaciente("Carla " + marca + " Rojas", "F" + unico());
		crearPaciente("Mateo " + marca + " Arias", "F" + unico());
		// «Rohas» y «Rojas» suenan igual; «Karla» y «Carla» tambien; el orden de las palabras no importa
		JsonNode r = ok(ejecutar(get("/api/pacientes").param("q", "Rohas Karla " + marca).with(como("recepcion", null))), 200);
		assertThat(r.get("items")).hasSize(1);
		assertThat(r.get("items").get(0).get("nombre").asString()).contains("Carla");
		assertThat(r.get("siguiente").isNull()).isTrue();
		// una sola palabra de la marca encuentra a los dos
		assertThat(ok(ejecutar(get("/api/pacientes").param("q", marca).with(como("medico", null))), 200).get("items")).hasSize(2);
		// sin coincidencias
		assertThat(ok(ejecutar(get("/api/pacientes").param("q", "Quispe" + marca).with(como("recepcion", null))), 200).get("items")).isEmpty();
	}

	@Test
	void busquedaPorDocumentoYPorNumeroDeHistoria() throws Exception {
		String doc = "DOC" + unico();
		JsonNode p = crearPaciente("Paciente Documento", doc);
		assertThat(ok(ejecutar(get("/api/pacientes").param("q", doc.substring(0, 6)).param("tipo", "documento").with(como("recepcion", null))), 200)
				.get("items")).hasSize(1);
		String hc = p.get("numeroHistoria").asString();
		JsonNode porHc = ok(ejecutar(get("/api/pacientes").param("q", hc.substring(3).replaceFirst("^0+", "")).param("tipo", "historia")
				.with(como("recepcion", null))), 200);
		assertThat(porHc.get("items")).hasSize(1);
		assertThat(porHc.get("items").get(0).get("id").asString()).isEqualTo(p.get("id").asString());
	}

	@Test
	void paginaPorCursorSinRepetirNiSaltar() throws Exception {
		String marca = "Pag" + unico().replace("-", "");
		for (int i = 0; i < 5; i++) crearPaciente("Persona" + i + " " + marca, "G" + unico());
		java.util.Set<String> vistos = new java.util.HashSet<>();
		String cursor = null;
		int paginas = 0;
		do {
			MockHttpServletRequestBuilder b = get("/api/pacientes").param("q", marca).param("limite", "2").with(como("recepcion", null));
			if (cursor != null) b.param("cursor", cursor);
			JsonNode r = ok(ejecutar(b), 200);
			r.get("items").forEach(n -> vistos.add(n.get("id").asString()));
			cursor = r.get("siguiente").isNull() ? null : r.get("siguiente").asString();
			paginas++;
		} while (cursor != null && paginas < 6);
		assertThat(paginas).isEqualTo(3);
		assertThat(vistos).hasSize(5);
		assertThat(ok(ejecutar(get("/api/pacientes").param("cursor", "basura").with(como("recepcion", null))), 400).get("code").asString())
				.isEqualTo("CURSOR_INVALIDO");
		assertThat(ok(ejecutar(get("/api/pacientes").param("limite", "500").with(como("recepcion", null))), 400).get("code").asString())
				.isEqualTo("VALIDACION");
		assertThat(ok(ejecutar(get("/api/pacientes").param("tipo", "otro").with(como("recepcion", null))), 400).get("code").asString())
				.isEqualTo("TIPO_BUSQUEDA_INVALIDO");
	}

	@Test
	void editarExigeIfMatchYDetectaVersionVieja() throws Exception {
		JsonNode p = crearPaciente("Edita Prueba", "E" + unico());
		String id = p.get("id").asString();
		String cuerpo = "{\"nombre\":\"Edita Cambiado\",\"fechaNacimiento\":\"1992-04-12\",\"sexo\":\"F\",\"telefono\":\"7000-0000\"}";
		assertThat(ok(ejecutar(conClave(put("/api/pacientes/" + id).with(como("recepcion", null))).content(cuerpo)), 400).get("code").asString())
				.isEqualTo("IF_MATCH_REQUERIDO");
		MockHttpServletResponse r = ejecutar(conClave(put("/api/pacientes/" + id).with(como("recepcion", null)).header("If-Match", "\"0\"")).content(cuerpo));
		JsonNode nuevo = ok(r, 200);
		assertThat(nuevo.get("nombre").asString()).isEqualTo("Edita Cambiado");
		assertThat(nuevo.get("version").asLong()).isEqualTo(1);
		assertThat(r.getHeader("ETag")).isEqualTo("\"1\"");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE aggregate_id = ?::uuid AND event_type = 'paciente.actualizado'", Integer.class, id)).isEqualTo(1);
		// reusar la version 0 -> otra persona ya cambio el registro
		JsonNode conflicto = ok(ejecutar(conClave(put("/api/pacientes/" + id).with(como("recepcion", null)).header("If-Match", "0")).content(cuerpo)), 409);
		assertThat(conflicto.get("code").asString()).isEqualTo("VERSION_CONFLICTO");
		assertThat(conflicto.get("versionVigente").asLong()).isEqualTo(1);
		// el medico no edita (403 antes de validar)
		assertThat(ejecutar(conClave(put("/api/pacientes/" + id).with(como("medico", null)).header("If-Match", "1")).content("{}")).getStatus()).isEqualTo(403);
	}

	@Test
	void contactosDeEmergenciaSePuedenAgregarListarYQuitar() throws Exception {
		JsonNode p = crearPaciente("Con Contactos", "C" + unico());
		String id = p.get("id").asString();
		JsonNode c = ok(ejecutar(conClave(post("/api/pacientes/" + id + "/contactos").with(como("recepcion", null)))
				.content("{\"nombre\":\"Marcelo Rojas\",\"parentesco\":\"Hermano\",\"telefono\":\"7098-5521\"}")), 201);
		assertThat(ok(ejecutar(get("/api/pacientes/" + id + "/contactos").with(como("medico", null))), 200).get("items")).hasSize(1);
		// el paciente ve los suyos pero no puede crearlos ni ver los de otro
		assertThat(ejecutar(get("/api/pacientes/" + id + "/contactos").with(como("paciente", id))).getStatus()).isEqualTo(200);
		assertThat(ejecutar(get("/api/pacientes/" + id + "/contactos").with(como("paciente", UUID.randomUUID().toString()))).getStatus()).isEqualTo(403);
		assertThat(ejecutar(conClave(post("/api/pacientes/" + id + "/contactos").with(como("paciente", id))).content("{}")).getStatus()).isEqualTo(403);
		assertThat(ejecutar(delete("/api/pacientes/" + id + "/contactos/" + c.get("id").asString()).with(como("recepcion", null))).getStatus()).isEqualTo(204);
		assertThat(ok(ejecutar(delete("/api/pacientes/" + id + "/contactos/" + UUID.randomUUID()).with(como("recepcion", null))), 404).get("code").asString())
				.isEqualTo("CONTACTO_NO_ENCONTRADO");
	}

	@Test
	void solicitudDeActualizacionPacienteSolicitaRecepcionApruebaYSePublicaElEvento() throws Exception {
		JsonNode p = crearPaciente("Solicita Cambio", "S" + unico());
		String id = p.get("id").asString();
		JsonNode s = ok(ejecutar(conClave(post("/api/pacientes/" + id + "/solicitudes").with(como("paciente", id)))
				.content("{\"campo\":\"TELEFONO\",\"valorPropuesto\":\"7 7654321\"}")), 201);
		assertThat(s.get("estado").asString()).isEqualTo("PENDIENTE");
		assertThat(s.get("valorActual").asString()).isEqualTo("7612-3045");
		// una pendiente por dato
		assertThat(ok(ejecutar(conClave(post("/api/pacientes/" + id + "/solicitudes").with(como("paciente", id)))
				.content("{\"campo\":\"TELEFONO\",\"valorPropuesto\":\"1\"}")), 409).get("code").asString()).isEqualTo("SOLICITUD_PENDIENTE");
		// nombre y documento no se piden por aqui
		assertThat(ejecutar(conClave(post("/api/pacientes/" + id + "/solicitudes").with(como("paciente", id)))
				.content("{\"campo\":\"NOMBRE\",\"valorPropuesto\":\"X\"}")).getStatus()).isEqualTo(400);
		// otro paciente no puede pedir cambios sobre este
		assertThat(ejecutar(conClave(post("/api/pacientes/" + id + "/solicitudes").with(como("paciente", UUID.randomUUID().toString())))
				.content("{\"campo\":\"EMAIL\",\"valorPropuesto\":\"x@y.com\"}")).getStatus()).isEqualTo(403);
		// recepcion la ve en la bandeja de pendientes
		JsonNode bandeja = ok(ejecutar(get("/api/pacientes/solicitudes").param("estado", "PENDIENTE").param("limite", "100").with(como("recepcion", null))), 200);
		List<String> ids = bandeja.get("items").valueStream().map(n -> n.get("id").asString()).toList();
		assertThat(ids).contains(s.get("id").asString());
		assertThat(ejecutar(get("/api/pacientes/solicitudes").with(como("paciente", id))).getStatus()).isEqualTo(403);
		// aprobar: cambia el telefono y publica paciente.actualizado
		JsonNode aprobada = ok(ejecutar(conClave(post("/api/pacientes/solicitudes/" + s.get("id").asString() + "/aprobar").with(como("recepcion", null)))), 200);
		assertThat(aprobada.get("estado").asString()).isEqualTo("APROBADA");
		assertThat(aprobada.get("resueltaPor").asString()).isEqualTo("recepcion");
		assertThat(ok(ejecutar(get("/api/pacientes/" + id).with(como("recepcion", null))), 200).get("telefono").asString()).isEqualTo("7 7654321");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE aggregate_id = ?::uuid AND event_type = 'paciente.actualizado'", Integer.class, id)).isEqualTo(1);
		// ya resuelta: no se resuelve dos veces
		assertThat(ok(ejecutar(conClave(post("/api/pacientes/solicitudes/" + s.get("id").asString() + "/rechazar").with(como("recepcion", null)))
				.content("{}")), 422).get("code").asString()).isEqualTo("SOLICITUD_YA_RESUELTA");
	}

	@Test
	void rechazarConservaElMotivoYNoCambiaElDato() throws Exception {
		JsonNode p = crearPaciente("Rechazo Prueba", "R" + unico());
		String id = p.get("id").asString();
		JsonNode s = ok(ejecutar(conClave(post("/api/pacientes/" + id + "/solicitudes").with(como("paciente", id)))
				.content("{\"campo\":\"EMAIL\",\"valorPropuesto\":\"nuevo@correo.com\"}")), 201);
		JsonNode r = ok(ejecutar(conClave(post("/api/pacientes/solicitudes/" + s.get("id").asString() + "/rechazar").with(como("recepcion", null)))
				.content("{\"motivo\":\"No coincide con el documento\"}")), 200);
		assertThat(r.get("estado").asString()).isEqualTo("RECHAZADA");
		assertThat(r.get("motivoRechazo").asString()).isEqualTo("No coincide con el documento");
		assertThat(ok(ejecutar(get("/api/pacientes/" + id).with(como("recepcion", null))), 200).get("email").asString()).isEqualTo("a@b.com");
		assertThat(ok(ejecutar(get("/api/pacientes/" + id + "/solicitudes").with(como("paciente", id))), 200).get("items")).hasSize(1);
	}

	@Test
	void catalogoLoLeeCualquierUsuarioYSoloElAdministradorLoModifica() throws Exception {
		String cod = "esp_" + unico().replace("-", "");
		// crear especialidad (admin) y verla (paciente)
		assertThat(ejecutar(conClave(post("/api/especialidades").with(como("recepcion", null))).content("{\"codigo\":\"" + cod + "\",\"nombre\":\"X\"}")).getStatus()).isEqualTo(403);
		JsonNode e = ok(ejecutar(conClave(post("/api/especialidades").with(como("administrador", null))).content("{\"codigo\":\"" + cod + "\",\"nombre\":\"Cardiologia\"}")), 201);
		assertThat(ok(ejecutar(conClave(post("/api/especialidades").with(como("administrador", null))).content("{\"codigo\":\"" + cod + "\",\"nombre\":\"Otra\"}")), 409)
				.get("code").asString()).isEqualTo("ESPECIALIDAD_DUPLICADA");
		assertThat(ok(ejecutar(conClave(post("/api/especialidades").with(como("administrador", null))).content("{\"codigo\":\"Mal Codigo\",\"nombre\":\"X\"}")), 400)
				.get("code").asString()).isEqualTo("VALIDACION");
		List<String> codigos = ok(ejecutar(get("/api/especialidades").with(como("paciente", UUID.randomUUID().toString()))), 200).get("items")
				.valueStream().map(n -> n.get("codigo").asString()).toList();
		assertThat(codigos).contains(cod);

		// medico: alta con consultorio y vinculo de usuario; publica medico.creado
		String doc = "M" + unico(), mat = "MAT" + unico();
		JsonNode m = ok(ejecutar(conClave(post("/api/medicos").with(como("administrador", null)))
				.content("{\"nombre\":\"Dra. Valeria Antelo\",\"documento\":\"" + doc + "\",\"matricula\":\"" + mat + "\",\"especialidad\":\"" + cod
						+ "\",\"consultorio\":\"Cons. 3\",\"usuarioKeycloak\":\"medico_" + cod + "\"}")), 201);
		String mid = m.get("id").asString();
		assertThat(m.get("documento").asString()).isEqualTo(doc);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE aggregate_id = ?::uuid AND event_type = 'medico.creado'", Integer.class, mid)).isEqualTo(1);
		assertThat(ok(ejecutar(conClave(post("/api/medicos").with(como("administrador", null)))
				.content("{\"nombre\":\"Otro\",\"documento\":\"" + doc + "\",\"matricula\":\"ZZZ" + unico() + "\",\"especialidad\":\"" + cod + "\"}")), 409)
				.get("code").asString()).isEqualTo("MEDICO_DUPLICADO");
		// el paciente lista medicos por especialidad y NO ve documento ni contacto
		JsonNode lista = ok(ejecutar(get("/api/medicos").param("especialidad", cod).with(como("paciente", UUID.randomUUID().toString()))), 200);
		assertThat(lista.get("items")).hasSize(1);
		JsonNode resumen = lista.get("items").get(0);
		assertThat(resumen.get("consultorio").asString()).isEqualTo("Cons. 3");
		assertThat(resumen.has("documento")).isFalse();
		assertThat(resumen.has("email")).isFalse();
		assertThat(resumen.get("especialidad").get("codigo").asString()).isEqualTo(cod);
		// editar (admin): desactivar lo saca del listado por defecto y publica medico.actualizado
		ok(ejecutar(conClave(put("/api/medicos/" + mid).with(como("administrador", null)))
				.content("{\"nombre\":\"Dra. Valeria Antelo\",\"documento\":\"" + doc + "\",\"matricula\":\"" + mat + "\",\"especialidad\":\"" + cod
						+ "\",\"consultorio\":\"Cons. 4\",\"activo\":false}")), 200);
		assertThat(ok(ejecutar(get("/api/medicos").param("especialidad", cod).with(como("recepcion", null))), 200).get("items")).isEmpty();
		assertThat(ok(ejecutar(get("/api/medicos").param("especialidad", cod).param("soloActivos", "false").with(como("recepcion", null))), 200).get("items")).hasSize(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE aggregate_id = ?::uuid AND event_type = 'medico.actualizado'", Integer.class, mid)).isEqualTo(1);
		// /me: el medico se reconoce por preferred_username
		assertThat(ejecutar(get("/api/medicos/me").with(como("medico", null))).getStatus()).isEqualTo(404);
		assertThat(e.get("codigo").asString()).isEqualTo(cod);
	}

	@Test
	void meDevuelveElPacienteVinculadoPorClaimOPorUsuario() throws Exception {
		JsonNode p = crearPaciente("Mi Perfil", "ME" + unico());
		String id = p.get("id").asString();
		assertThat(ok(ejecutar(get("/api/pacientes/me").with(como("paciente", id))), 200).get("id").asString()).isEqualTo(id);
		assertThat(ejecutar(get("/api/pacientes/me").with(como("recepcion", null))).getStatus()).isEqualTo(403);
		assertThat(ok(ejecutar(get("/api/pacientes/me").with(como("paciente", null))), 404).get("code").asString()).isEqualTo("PACIENTE_NO_VINCULADO");
	}
}
