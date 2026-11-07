package com.sigec.ms4_historias.infrastructure.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Declarable;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Topologia de RabbitMQ segun contracts/events/topology.json. RabbitAdmin la declara al conectar (idempotente).
 * Si los argumentos difieren de lo ya declarado, RabbitMQ responde 406 PRECONDITION_FAILED.
 */
@Configuration
@EnableScheduling
public class RabbitTopologyConfig {

	public static final String EXCHANGE_SAGA = "sigec.saga";
	public static final String EXCHANGE_EVENTOS = "sigec.eventos";
	public static final String EXCHANGE_RETRY = "sigec.retry";
	public static final String EXCHANGE_DLX = "sigec.dlx";
	public static final String COLA_EVENTOS = "ms4.eventos";

	/** Niveles de espera de los reintentos: sufijo y TTL en milisegundos. */
	private static final String[] TIER_SUFFIX = { "retry.5s", "retry.30s", "retry.2m" };
	private static final int[] TIER_TTL_MS = { 5_000, 30_000, 120_000 };

	@Bean
	DirectExchange sigecSagaExchange() {
		return new DirectExchange(EXCHANGE_SAGA, true, false);
	}

	@Bean
	TopicExchange sigecEventosExchange() {
		return new TopicExchange(EXCHANGE_EVENTOS, true, false);
	}

	@Bean
	DirectExchange sigecRetryExchange() {
		return new DirectExchange(EXCHANGE_RETRY, true, false);
	}

	@Bean
	DirectExchange sigecDlxExchange() {
		return new DirectExchange(EXCHANGE_DLX, true, false);
	}

	/** MS4 es duena de ms4.eventos: pacientes (crean la historia) y citas (habilitan la consulta). */
	@Bean
	Declarables ms4EventosQueue() {
		List<Declarable> all = new ArrayList<>(consumerQueue(COLA_EVENTOS));
		for (String clave : List.of("paciente.creado", "paciente.actualizado", "cita.confirmada", "cita.cancelada",
				"cita.asistencia-registrada", "imagen.informe-validado")) {
			all.add(bind(COLA_EVENTOS, EXCHANGE_EVENTOS, clave, true));
		}
		return new Declarables(all);
	}

	/** Cola de consumo + DLQ + colas de espera para reintentos. */
	static List<Declarable> consumerQueue(String name) {
		List<Declarable> all = new ArrayList<>();
		all.add(QueueBuilder.durable(name)
				.deadLetterExchange(EXCHANGE_DLX)
				.deadLetterRoutingKey(name + ".dlq")
				.build());
		Queue dlq = QueueBuilder.durable(name + ".dlq").build();
		all.add(dlq);
		all.add(BindingBuilder.bind(dlq).to(new DirectExchange(EXCHANGE_DLX)).with(name + ".dlq"));
		for (int i = 0; i < TIER_SUFFIX.length; i++) {
			String waitName = name + "." + TIER_SUFFIX[i];
			Queue wait = QueueBuilder.durable(waitName)
					.ttl(TIER_TTL_MS[i])
					.deadLetterExchange("")
					.deadLetterRoutingKey(name)
					.build();
			all.add(wait);
			all.add(BindingBuilder.bind(wait).to(new DirectExchange(EXCHANGE_RETRY)).with(waitName));
		}
		return all;
	}

	static Binding bind(String queue, String exchange, String routingKey, boolean topic) {
		return topic
				? BindingBuilder.bind(new Queue(queue)).to(new TopicExchange(exchange)).with(routingKey)
				: BindingBuilder.bind(new Queue(queue)).to(new DirectExchange(exchange)).with(routingKey);
	}
}
