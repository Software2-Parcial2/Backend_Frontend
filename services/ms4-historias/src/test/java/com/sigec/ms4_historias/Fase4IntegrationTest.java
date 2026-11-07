package com.sigec.ms4_historias;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.function.BooleanSupplier;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Fase 4: consumidor de eventos, consultas (borrador -> firmada), antecedentes, consentimientos, auditoria y roles. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class Fase4IntegrationTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired RabbitTemplate rabbit;
	final ObjectMapper json = new ObjectMapper();

	final UUID medicoId = UUID.randomUUID();

	/** Cada peticion lleva una Idempotency-Key nueva (obligatoria en POST/PUT/PATCH). */
	static RequestPostProcessor llave(RequestPostProcessor pp) {
		return req -> {
			req.addHeader("Idempotency-Key", UUID.randomUUID().toString());
			return pp.postProcessRequest(req);
		};
	}

	RequestPostProcessor como(String rol) {
		return llave(jwt().jwt(j -> j.subject("u-" + rol).claim("medico_id", medicoId.toString())).authorities(new SimpleGrantedAuthority("ROLE_" + rol)));
	}

	RequestPostProcessor paciente(UUID pacienteId) {
		return llave(jwt().jwt(j -> j.subject("u-pac-" + pacienteId).claim("paciente_id", pacienteId.toString()))
				.authorities(new SimpleGrantedAuthority("ROLE_paciente")));
	}

	static void esperar(BooleanSupplier condicion) throws InterruptedException {
		long limite = System.nanoTime() + Duration.ofSeconds(20).toNanos();
		while (!condicion.getAsBoolean()) {
			if (System.nanoTime() > limite) {
				throw new AssertionError("condicion no cumplida en 20 s");
			}
			Thread.sleep(100);
		}
	}

	MockHttpServletResponse ejecutar(MockHttpServletRequestBuilder b) throws Exception {
		return mvc.perform(b).andReturn().getResponse();
	}

	JsonNode cuerpo(MockHttpServletResponse r) throws Exception {
		return json.readTree(r.getContentAsString());
	}

	MockHttpServletRequestBuilder conJson(MockHttpServletRequestBuilder b, String body) {
		return b.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	void enviar(String tipo, UUID id, String payload) {
		String env = "{\"id\":\"" + id + "\",\"type\":\"" + tipo + "\",\"occurredAt\":\"" + Instant.now() + "\",\"correlationId\":\"" + id
				+ "\",\"causationId\":null,\"version\":1,\"payload\":" + payload + "}";
		Message m = MessageBuilder.withBody(env.getBytes()).setContentType(MessageProperties.CONTENT_TYPE_JSON).setMessageId(id.toString()).build();
		rabbit.send("sigec.eventos", tipo, m);
	}

	UUID crearHistoria(String nombre) throws Exception {
		UUID pacienteId = UUID.randomUUID();
		enviar("paciente.creado", UUID.randomUUID(), "{\"pacienteId\":\"" + pacienteId + "\",\"numeroHistoria\":\"HC-" + pacienteId.toString().substring(0, 6)
				+ "\",\"nombre\":\"" + nombre + "\",\"documento\":\"D-" + pacienteId + "\"}");
		esperar(() -> jdbc.queryForObject("SELECT count(*) FROM historias_clinicas WHERE paciente_id = ?",
				Integer.class, pacienteId) == 1);
		return pacienteId;
	}

	UUID historiaId(UUID pacienteId) throws Exception {
		return UUID.fromString(cuerpo(ejecutar(get("/api/historias/paciente/" + pacienteId).with(como("medico")))).get("id").asString());
	}

	@Test
	void pacienteCreadoCreaLaHistoriaYSeDeduplicaPorIdDeMensaje() throws Exception {
		UUID pacienteId = UUID.randomUUID();
		UUID msg = UUID.randomUUID();
		String payload = "{\"pacienteId\":\"" + pacienteId + "\",\"numeroHistoria\":\"HC-777001\",\"nombre\":\"Carla Rojas\",\"documento\":\"D-1\"}";
		enviar("paciente.creado", msg, payload);
		enviar("paciente.creado", msg, payload); // reentrega: mismo id
		esperar(() -> jdbc.queryForObject("SELECT count(*) FROM processed_messages WHERE id = ? AND status = 'COMPLETADO'",
				Integer.class, msg) == 1);
		JsonNode h = cuerpo(ejecutar(get("/api/historias/paciente/" + pacienteId).with(como("medico"))));
		assertThat(h.get("numeroHistoria").asString()).isEqualTo("HC-777001");
		assertThat(h.get("pacienteNombre").asString()).isEqualTo("Carla Rojas");
		// paciente.actualizado cambia el nombre
		enviar("paciente.actualizado", UUID.randomUUID(), "{\"pacienteId\":\"" + pacienteId
				+ "\",\"numeroHistoria\":\"HC-777001\",\"nombre\":\"Carla Rojas Vda\",\"documento\":\"D-1\",\"version\":1}");
		esperar(() -> "Carla Rojas Vda".equals(
				jdbc.queryForObject("SELECT paciente_nombre FROM historias_clinicas WHERE paciente_id = ?", String.class, pacienteId)));
	}

	@Test
	void mensajeMalformadoVaALaDlqSinTumbarElConsumidor() throws Exception {
		rabbit.send("sigec.eventos", "paciente.creado", MessageBuilder.withBody("no es json".getBytes()).build());
		esperar(() -> {
			var info = rabbit.execute(ch -> ch.queueDeclarePassive("ms4.eventos.dlq").getMessageCount());
			return info >= 1;
		});
	}

	@Test
	void rolesRecepcionNoEntraAdministradorSoloAuditoria() throws Exception {
		UUID pacienteId = crearHistoria("Ana");
		assertThat(ejecutar(get("/api/historias/paciente/" + pacienteId).with(como("recepcion"))).getStatus()).isEqualTo(403);
		assertThat(ejecutar(get("/api/historias/paciente/" + pacienteId).with(como("administrador"))).getStatus()).isEqualTo(403);
		assertThat(ejecutar(get("/api/historias/paciente/" + pacienteId).with(como("caja"))).getStatus()).isEqualTo(403);
		UUID hid = historiaId(pacienteId);
		assertThat(ejecutar(get("/api/historias/" + hid + "/auditoria").with(como("administrador"))).getStatus()).isEqualTo(200);
		assertThat(ejecutar(get("/api/historias/" + hid + "/auditoria").with(como("medico"))).getStatus()).isEqualTo(403);
	}

	@Test
	void pacienteSoloVeSuHistoriaYAjenaEs404() throws Exception {
		UUID mia = crearHistoria("Mia");
		UUID otra = crearHistoria("Otra");
		assertThat(ejecutar(get("/api/historias/paciente/" + mia).with(paciente(mia))).getStatus()).isEqualTo(200);
		assertThat(ejecutar(get("/api/historias/paciente/" + otra).with(paciente(mia))).getStatus()).isEqualTo(404);
	}

	@Test
	void flujoConsultaBorradorEdicionConflictoYFirma() throws Exception {
		UUID pacienteId = crearHistoria("Luis");
		UUID hid = historiaId(pacienteId);
		UUID citaId = UUID.randomUUID();

		// sin cita confirmada: 422
		MockHttpServletResponse r = ejecutar(conJson(post("/api/historias/" + hid + "/consultas").with(como("medico")),
				"{\"citaId\":\"" + citaId + "\",\"motivo\":\"Dolor\"}"));
		assertThat(r.getStatus()).isEqualTo(422);
		assertThat(cuerpo(r).get("code").asString()).isEqualTo("CITA_NO_HABILITADA");

		// cita.confirmada habilita
		enviar("cita.confirmada", UUID.randomUUID(), "{\"citaId\":\"" + citaId + "\",\"pacienteId\":\"" + pacienteId + "\",\"medicoId\":\"" + medicoId
				+ "\",\"fechaHora\":\"" + Instant.now().plusSeconds(3600) + "\"}");
		esperar(() -> jdbc.queryForObject("SELECT count(*) FROM citas_proyeccion WHERE cita_id = ?", Integer.class, citaId) == 1);
		r = ejecutar(conJson(post("/api/historias/" + hid + "/consultas").with(como("medico")),
				"{\"citaId\":\"" + citaId + "\",\"motivo\":\"Dolor\",\"signosVitales\":{\"pa\":\"120/80\"}}"));
		assertThat(r.getStatus()).isEqualTo(201);
		assertThat(r.getHeader("ETag")).isEqualTo("\"0\"");
		JsonNode c = cuerpo(r);
		String cid = c.get("id").asString();
		assertThat(c.get("estado").asString()).isEqualTo("BORRADOR");

		// segunda consulta de la misma cita: 409
		r = ejecutar(conJson(post("/api/historias/" + hid + "/consultas").with(como("medico")), "{\"citaId\":\"" + citaId + "\",\"motivo\":\"x\"}"));
		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(cuerpo(r).get("code").asString()).isEqualTo("CONSULTA_YA_EXISTE");

		// firmar sin diagnostico: 422
		r = ejecutar(post("/api/historias/consultas/" + cid + "/firmar").with(como("medico")));
		assertThat(r.getStatus()).isEqualTo(422);
		assertThat(cuerpo(r).get("code").asString()).isEqualTo("DIAGNOSTICO_REQUERIDO");

		// editar sin If-Match: 400
		String edit = "{\"motivo\":\"Dolor\",\"diagnostico\":\"Gastritis\",\"tratamiento\":\"Dieta\",\"indicaciones\":\"Reposo\","
				+ "\"receta\":[{\"medicamento\":\"Omeprazol 20 mg\",\"dosis\":\"1 capsula\",\"frecuencia\":\"c/24h\",\"duracion\":\"14 dias\"}]}";
		assertThat(ejecutar(conJson(put("/api/historias/consultas/" + cid).with(como("medico")), edit)).getStatus()).isEqualTo(400);

		// editar con la version correcta: 200 y version 1
		r = ejecutar(conJson(put("/api/historias/consultas/" + cid).with(como("medico")).header("If-Match", "\"0\""), edit));
		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(cuerpo(r).get("version").asLong()).isEqualTo(1);

		// otro profesional edito con la version vieja: 409 con la version vigente
		r = ejecutar(conJson(put("/api/historias/consultas/" + cid).with(como("medico")).header("If-Match", "0"), edit));
		assertThat(r.getStatus()).isEqualTo(409);
		JsonNode p = cuerpo(r);
		assertThat(p.get("code").asString()).isEqualTo("VERSION_CONFLICTO");
		assertThat(p.get("versionVigente").asLong()).isEqualTo(1);

		// la receta aun no existe (borrador)
		assertThat(ejecutar(get("/api/historias/consultas/" + cid + "/receta").with(como("medico"))).getStatus()).isEqualTo(409);
		// el paciente no ve borradores
		assertThat(ejecutar(get("/api/historias/consultas/" + cid).with(paciente(pacienteId))).getStatus()).isEqualTo(404);

		// firmar: otro medico no puede
		RequestPostProcessor otroMedico = llave(jwt().jwt(j -> j.subject("otro").claim("medico_id", UUID.randomUUID().toString()))
				.authorities(new SimpleGrantedAuthority("ROLE_medico")));
		assertThat(ejecutar(post("/api/historias/consultas/" + cid + "/firmar").with(otroMedico)).getStatus()).isEqualTo(403);
		r = ejecutar(post("/api/historias/consultas/" + cid + "/firmar").with(como("medico")));
		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(cuerpo(r).get("estado").asString()).isEqualTo("FIRMADA");

		// publico consulta.firmada en el outbox, sin contenido clinico
		JsonNode evento = json.readTree(jdbc.queryForObject("SELECT payload::text FROM outbox WHERE event_type = 'consulta.firmada' AND aggregate_id = ?",
				String.class, UUID.fromString(cid)));
		assertThat(evento.get("pacienteId").asString()).isEqualTo(pacienteId.toString());
		assertThat(evento.has("diagnostico")).isFalse();

		// firmada: no se edita, se agrega evolucion
		r = ejecutar(conJson(put("/api/historias/consultas/" + cid).with(como("medico")).header("If-Match", "2"), edit));
		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(cuerpo(r).get("code").asString()).isEqualTo("CONSULTA_FIRMADA");
		assertThat(ejecutar(conJson(post("/api/historias/consultas/" + cid + "/evoluciones").with(como("medico")), "{\"nota\":\"Mejora\"}")).getStatus())
				.isEqualTo(201);
		assertThat(cuerpo(ejecutar(get("/api/historias/consultas/" + cid + "/evoluciones").with(como("medico")))).size()).isEqualTo(1);

		// receta y visibilidad del paciente
		JsonNode receta = cuerpo(ejecutar(get("/api/historias/consultas/" + cid + "/receta").with(como("medico"))));
		assertThat(receta.get("items").get(0).get("medicamento").asString()).isEqualTo("Omeprazol 20 mg");
		assertThat(receta.get("pacienteNombre").asString()).isEqualTo("Luis");
		assertThat(ejecutar(get("/api/historias/consultas/" + cid).with(paciente(pacienteId))).getStatus()).isEqualTo(200);
		assertThat(cuerpo(ejecutar(get("/api/historias/" + hid + "/consultas").with(paciente(pacienteId)))).get("items").size()).isEqualTo(1);
		assertThat(ejecutar(get("/api/historias/consultas/" + cid).with(paciente(UUID.randomUUID()))).getStatus()).isEqualTo(404);

		// la cancelacion posterior de la cita bloquea nuevas consultas
		UUID cita2 = UUID.randomUUID();
		enviar("cita.cancelada", UUID.randomUUID(), "{\"citaId\":\"" + cita2 + "\",\"pacienteId\":\"" + pacienteId + "\",\"medicoId\":\"" + medicoId
				+ "\",\"fechaHora\":\"" + Instant.now().plusSeconds(7200) + "\",\"motivo\":\"x\"}");
		esperar(() -> jdbc.queryForObject("SELECT count(*) FROM citas_proyeccion WHERE cita_id = ?", Integer.class, cita2) == 1);
		r = ejecutar(conJson(post("/api/historias/" + hid + "/consultas").with(como("medico")), "{\"citaId\":\"" + cita2 + "\",\"motivo\":\"x\"}"));
		assertThat(r.getStatus()).isEqualTo(422);
	}

	@Test
	void antecedentesConsentimientosYAuditoria() throws Exception {
		UUID pacienteId = crearHistoria("Eva");
		UUID hid = historiaId(pacienteId);

		MockHttpServletResponse r = ejecutar(conJson(post("/api/historias/" + hid + "/antecedentes").with(como("medico")),
				"{\"tipo\":\"ALERGIA\",\"descripcion\":\"Penicilina\"}"));
		assertThat(r.getStatus()).isEqualTo(201);
		String aid = cuerpo(r).get("id").asString();
		assertThat(ejecutar(conJson(post("/api/historias/" + hid + "/antecedentes").with(como("medico")), "{\"tipo\":\"XX\",\"descripcion\":\"a\"}"))
				.getStatus()).isEqualTo(400);
		r = ejecutar(put("/api/historias/antecedentes/" + aid).with(como("medico")).header("If-Match", "5").contentType(MediaType.APPLICATION_JSON)
				.content("{\"descripcion\":\"Penicilina y sulfas\"}"));
		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(cuerpo(r).get("versionVigente").asLong()).isEqualTo(0);
		r = ejecutar(put("/api/historias/antecedentes/" + aid).with(como("medico")).header("If-Match", "0").contentType(MediaType.APPLICATION_JSON)
				.content("{\"descripcion\":\"Penicilina y sulfas\"}"));
		assertThat(r.getStatus()).isEqualTo(200);
		r = ejecutar(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/historias/antecedentes/" + aid).with(como("medico"))
				.header("If-Match", "1"));
		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(cuerpo(r).get("activo").asBoolean()).isFalse();
		assertThat(cuerpo(ejecutar(get("/api/historias/" + hid + "/antecedentes").with(como("medico")))).size()).isEqualTo(0);

		// consentimientos: solo el paciente otorga; uno vigente por tipo
		String body = "{\"tipo\":\"IMAGENES_IA\",\"versionTexto\":\"2\"}";
		assertThat(ejecutar(conJson(post("/api/historias/paciente/" + pacienteId + "/consentimientos").with(como("medico")), body)).getStatus()).isEqualTo(403);
		r = ejecutar(conJson(post("/api/historias/paciente/" + pacienteId + "/consentimientos").with(paciente(pacienteId)), body));
		assertThat(r.getStatus()).isEqualTo(201);
		String kid = cuerpo(r).get("id").asString();
		r = ejecutar(conJson(post("/api/historias/paciente/" + pacienteId + "/consentimientos").with(paciente(pacienteId)), body));
		assertThat(r.getStatus()).isEqualTo(409);
		assertThat(cuerpo(r).get("code").asString()).isEqualTo("CONSENTIMIENTO_VIGENTE");
		assertThat(ejecutar(post("/api/historias/consentimientos/" + kid + "/revocar").with(paciente(UUID.randomUUID()))).getStatus()).isEqualTo(404);
		r = ejecutar(post("/api/historias/consentimientos/" + kid + "/revocar").with(paciente(pacienteId)));
		assertThat(r.getStatus()).isEqualTo(200);
		assertThat(cuerpo(r).get("vigente").asBoolean()).isFalse();
		assertThat(cuerpo(ejecutar(get("/api/historias/paciente/" + pacienteId + "/consentimientos").with(como("medico")))).size()).isEqualTo(1);

		// auditoria: lo anterior quedo registrado (solo ids y accion), paginada y filtrable
		JsonNode todo = cuerpo(ejecutar(get("/api/historias/" + hid + "/auditoria?limite=2").with(como("administrador"))));
		assertThat(todo.get("items").size()).isEqualTo(2);
		assertThat(todo.get("siguiente").isNull()).isFalse();
		JsonNode sig = cuerpo(ejecutar(get("/api/historias/" + hid + "/auditoria?limite=2&cursor=" + todo.get("siguiente").asString()).with(como("administrador"))));
		assertThat(sig.get("items").get(0).get("id").asLong()).isLessThan(todo.get("items").get(1).get("id").asLong());
		JsonNode crear = cuerpo(ejecutar(get("/api/historias/" + hid + "/auditoria?tipo=CREAR").with(como("administrador"))));
		assertThat(crear.get("items").size()).isGreaterThanOrEqualTo(1);
		crear.get("items").forEach(i -> assertThat(i.get("accion").asString()).isEqualTo("CREAR"));
		assertThat(ejecutar(get("/api/historias/" + hid + "/auditoria?cursor=xx").with(como("administrador"))).getStatus()).isEqualTo(400);
		assertThat(ejecutar(get("/api/historias/" + hid + "/auditoria?tipo=ZZZ").with(como("administrador"))).getStatus()).isEqualTo(400);
	}
}
