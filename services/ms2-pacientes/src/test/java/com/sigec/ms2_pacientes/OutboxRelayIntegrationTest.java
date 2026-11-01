package com.sigec.ms2_pacientes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import com.sigec.ms2_pacientes.infrastructure.adapter.out.messaging.OutboxRelay;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// El planificador queda casi desactivado (1 h) para que la prueba controle cuando corre el relay.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
@AutoConfigureMockMvc
class OutboxRelayIntegrationTest {

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired OutboxRelay relay;
	@Autowired RabbitAdmin admin;
	@Autowired RabbitTemplate rabbit;
	@Autowired ObjectMapper mapper;

	String queue;

	@BeforeEach
	void prepararCola() {
		jdbc.update("DELETE FROM outbox");
		queue = "test.relay." + UUID.randomUUID().toString().substring(0, 8);
		Queue q = new Queue(queue, true, false, false);
		admin.declareQueue(q);
		admin.declareExchange(new TopicExchange("sigec.eventos", true, false));
		admin.declareBinding(BindingBuilder.bind(q).to(new TopicExchange("sigec.eventos")).with("paciente.creado"));
	}

	@AfterEach
	void borrarCola() {
		admin.deleteQueue(queue);
	}

	@Test
	void publicaElEventoComoSobreYMarcaPublishedAt() throws Exception {
		String documento = "RL-" + UUID.randomUUID().toString().substring(0, 12);
		var res = mvc.perform(post("/api/pacientes")
				.with(jwt().jwt(j -> j.subject("u1")).authorities(new SimpleGrantedAuthority("ROLE_recepcion")))
				.header("Idempotency-Key", UUID.randomUUID().toString()).contentType("application/json")
				.content("{\"nombre\":\"Ana\",\"documento\":\"" + documento + "\",\"fechaNacimiento\":\"1990-05-01\"}"))
				.andReturn().getResponse();
		assertThat(res.getStatus()).isEqualTo(201);
		UUID outboxId = jdbc.queryForObject("SELECT id FROM outbox WHERE published_at IS NULL", UUID.class);

		assertThat(relay.relayBatch()).isEqualTo(1);

		Message msg = rabbit.receive(queue, 5000);
		assertThat(msg).isNotNull();
		assertThat(msg.getMessageProperties().getReceivedDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
		JsonNode env = mapper.readTree(new String(msg.getBody()));
		assertThat(env.get("id").asString()).isEqualTo(outboxId.toString()); // mismo id que la fila: reentrega deduplicable
		assertThat(env.get("type").asString()).isEqualTo("paciente.creado");
		assertThat(env.get("occurredAt").asString()).endsWith("Z");
		assertThat(env.get("causationId").isNull()).isTrue();
		assertThat(env.get("version").asInt()).isEqualTo(1);
		assertThat(env.get("payload").get("documento").asString()).isEqualTo(documento);
		assertThat(env.get("payload").has("occurredAt")).isFalse(); // la fecha va en el sobre, no en el payload
		assertThat(env.get("payload").has("pacienteId")).isTrue();

		assertThat(jdbc.queryForObject("SELECT published_at IS NOT NULL FROM outbox WHERE id = ?", Boolean.class, outboxId)).isTrue();
		assertThat(relay.relayBatch()).isZero(); // ya publicado: no se repite
		assertThat(rabbit.receive(queue, 300)).isNull();
	}

	@Test
	void respetaElTamanoDelLoteYElOrden() {
		for (int i = 0; i < 3; i++) {
			jdbc.update("""
					INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, created_at)
					VALUES (?, 'Paciente', ?, 'paciente.creado', ?::jsonb, now() + (? * interval '1 second'))
					""", UUID.randomUUID(), UUID.randomUUID(),
					"{\"pacienteId\":\"" + UUID.randomUUID() + "\",\"nombre\":\"n" + i + "\",\"documento\":\"d" + i + "\"}", i);
		}
		assertThat(relay.relayBatch()).isEqualTo(3);
		for (int i = 0; i < 3; i++) {
			Message m = rabbit.receive(queue, 3000);
			assertThat(m).isNotNull();
			assertThat(new String(m.getBody())).contains("\"documento\":\"d" + i + "\""); // en orden de creacion
		}
	}
}
