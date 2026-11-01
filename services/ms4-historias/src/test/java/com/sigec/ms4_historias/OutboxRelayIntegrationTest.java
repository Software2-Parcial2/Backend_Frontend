package com.sigec.ms4_historias;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.sigec.ms4_historias.infrastructure.adapter.out.messaging.OutboxRelay;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "sigec.outbox.interval-ms=3600000")
class OutboxRelayIntegrationTest {

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
		admin.declareBinding(BindingBuilder.bind(q).to(new TopicExchange("sigec.eventos")).with("historia.#"));
	}

	@AfterEach
	void borrarCola() {
		admin.deleteQueue(queue);
	}

	@Test
	void publicaEnOrdenComoSobreYMarcaPublishedAt() {
		UUID first = UUID.randomUUID();
		for (int i = 0; i < 3; i++) {
			jdbc.update("""
					INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, created_at)
					VALUES (?, 'Historia', ?, 'historia.creada', ?::jsonb, now() + (? * interval '1 second'))
					""", i == 0 ? first : UUID.randomUUID(), UUID.randomUUID(), "{\"n\":" + i + ",\"occurredAt\":\"x\"}", i);
		}
		assertThat(relay.relayBatch()).isEqualTo(3);
		for (int i = 0; i < 3; i++) {
			Message m = rabbit.receive(queue, 3000);
			assertThat(m).isNotNull();
			assertThat(m.getMessageProperties().getReceivedDeliveryMode()).isEqualTo(MessageDeliveryMode.PERSISTENT);
			JsonNode env = mapper.readTree(new String(m.getBody()));
			assertThat(env.get("type").asString()).isEqualTo("historia.creada");
			assertThat(env.get("payload").get("n").asInt()).isEqualTo(i); // orden de creacion
			assertThat(env.get("payload").has("occurredAt")).isFalse();
			if (i == 0) {
				assertThat(env.get("id").asString()).isEqualTo(first.toString());
			}
		}
		assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox WHERE published_at IS NULL", Integer.class)).isZero();
		assertThat(relay.relayBatch()).isZero();
	}
}
