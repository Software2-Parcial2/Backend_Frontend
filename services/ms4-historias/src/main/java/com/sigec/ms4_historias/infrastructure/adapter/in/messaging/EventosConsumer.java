package com.sigec.ms4_historias.infrastructure.adapter.in.messaging;

import java.io.IOException;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import com.rabbitmq.client.Channel;
import com.sigec.ms4_historias.application.port.in.ProyeccionesUseCase;
import com.sigec.ms4_historias.domain.model.EstudioValidado;
import com.sigec.ms4_historias.infrastructure.config.RabbitTopologyConfig;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Consume {@code ms4.eventos}: paciente.creado/actualizado (historia) y cita.confirmada/cancelada/asistencia-registrada
 * (citas que habilitan una consulta). Deduplica por id del sobre; un fallo se reintenta por las colas de espera
 * (5 s, 30 s, 2 min) y despues va a la DLQ. Un mensaje malformado va directo a la DLQ.
 */
@Component
public class EventosConsumer {

	private static final Logger log = LoggerFactory.getLogger(EventosConsumer.class);
	private static final String[] ESPERAS = { "retry.5s", "retry.30s", "retry.2m" };
	private static final String H_REINTENTOS = "x-reintentos";

	private final ProyeccionesUseCase proyecciones;
	private final MensajesProcesados procesados;
	private final RabbitTemplate rabbit;
	private final ObjectMapper mapper;

	public EventosConsumer(ProyeccionesUseCase proyecciones, MensajesProcesados procesados, RabbitTemplate rabbit, ObjectMapper mapper) {
		this.proyecciones = proyecciones;
		this.procesados = procesados;
		this.rabbit = rabbit;
		this.mapper = mapper;
	}

	@RabbitListener(queues = RabbitTopologyConfig.COLA_EVENTOS)
	public void recibir(Message message, Channel channel) throws IOException {
		long tag = message.getMessageProperties().getDeliveryTag();
		UUID id;
		String tipo;
		JsonNode payload;
		try {
			JsonNode env = mapper.readTree(message.getBody());
			id = UUID.fromString(env.get("id").asString());
			tipo = env.get("type").asString();
			payload = env.get("payload");
			if (payload == null || !payload.isObject()) {
				throw new IllegalArgumentException("sin payload");
			}
		}
		catch (RuntimeException e) {
			log.warn("ms4: mensaje malformado, a la DLQ: {}", e.getMessage());
			channel.basicReject(tag, false);
			return;
		}
		if (!procesados.reservar(id)) {
			channel.basicAck(tag, false); // duplicado o en proceso por otra instancia
			return;
		}
		try {
			despachar(tipo, payload);
			procesados.completar(id);
			channel.basicAck(tag, false);
		}
		catch (IllegalArgumentException | NullPointerException e) {
			log.warn("ms4: {} {} con datos invalidos, a la DLQ: {}", tipo, id, e.getMessage());
			procesados.liberar(id);
			channel.basicReject(tag, false);
		}
		catch (RuntimeException e) {
			log.warn("ms4: fallo al procesar {} {}: {}", tipo, id, e.getMessage());
			procesados.liberar(id);
			reintentar(message, channel, tag);
		}
	}

	private void despachar(String tipo, JsonNode p) {
		switch (tipo) {
			case "paciente.creado", "paciente.actualizado" -> proyecciones.pacienteRegistrado(uuid(p, "pacienteId"), texto(p, "numeroHistoria"),
					texto(p, "nombre"));
			case "cita.confirmada" -> proyecciones.citaConfirmada(uuid(p, "citaId"), uuid(p, "pacienteId"), uuid(p, "medicoId"), instante(p));
			case "cita.cancelada" -> cambio(p, "CANCELADA");
			case "cita.asistencia-registrada" -> cambio(p, requerido(p, "asistencia"));
			case "imagen.informe-validado" -> proyecciones.estudioValidado(new EstudioValidado(uuid(p, "imagenId"), uuid(p, "pacienteId"),
					requerido(p, "estudio"), requerido(p, "decision"), requerido(p, "validacion"),
					texto(p, "medicoId") == null ? null : UUID.fromString(texto(p, "medicoId")), Instant.parse(requerido(p, "validadoEn")),
					requerido(p, "huella"), texto(p, "versionModelo")));
			default -> log.debug("ms4: evento {} ignorado", tipo);
		}
	}

	private void cambio(JsonNode p, String estado) {
		proyecciones.citaCambiada(uuid(p, "citaId"), uuid(p, "pacienteId"), uuid(p, "medicoId"), instante(p), estado);
	}

	private void reintentar(Message message, Channel channel, long tag) throws IOException {
		Integer n = message.getMessageProperties().getHeader(H_REINTENTOS);
		int intento = n == null ? 0 : n;
		if (intento >= ESPERAS.length) {
			channel.basicReject(tag, false);
			return;
		}
		Message copia = MessageBuilder.fromMessage(message).setHeader(H_REINTENTOS, intento + 1).build();
		rabbit.send(RabbitTopologyConfig.EXCHANGE_RETRY, RabbitTopologyConfig.COLA_EVENTOS + "." + ESPERAS[intento], copia);
		channel.basicAck(tag, false);
	}

	private static String requerido(JsonNode p, String campo) {
		JsonNode n = p.get(campo);
		if (n == null || n.isNull() || n.asString().isBlank()) {
			throw new IllegalArgumentException("falta " + campo);
		}
		return n.asString();
	}

	private static String texto(JsonNode p, String campo) {
		JsonNode n = p.get(campo);
		return n == null || n.isNull() ? null : n.asString();
	}

	private static UUID uuid(JsonNode p, String campo) {
		return UUID.fromString(requerido(p, campo));
	}

	private static Instant instante(JsonNode p) {
		return Instant.parse(requerido(p, "fechaHora"));
	}
}
