package com.sigec.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.sun.net.httpserver.HttpServer;

/**
 * Contrato del gateway: tabla de rutas, 401/403 en problem+json, X-Correlation-Id de punta a punta y CORS.
 * Los servicios se simulan con un servidor local que devuelve lo que recibio.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayRutasTest {

	static final HttpServer BACKEND = arrancarBackend();

	static HttpServer arrancarBackend() {
		try {
			HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			s.createContext("/", ex -> {
				String cuerpo = "{\"path\":\"" + ex.getRequestURI().getPath() + "\",\"correlation\":\""
						+ ex.getRequestHeaders().getFirst("X-Correlation-Id") + "\",\"auth\":\""
						+ (ex.getRequestHeaders().getFirst("Authorization") != null) + "\"}";
				byte[] b = cuerpo.getBytes(StandardCharsets.UTF_8);
				ex.getResponseHeaders().add("Content-Type", "application/json");
				ex.sendResponseHeaders(200, b.length);
				ex.getResponseBody().write(b);
				ex.close();
			});
			s.start();
			return s;
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	@AfterAll
	static void parar() {
		BACKEND.stop(0);
	}

	@DynamicPropertySource
	static void props(DynamicPropertyRegistry r) {
		String url = "http://127.0.0.1:" + BACKEND.getAddress().getPort();
		for (String n : List.of("MS1", "MS2", "MS3", "MS4", "MS5", "MS6", "MS7", "MS8")) {
			r.add(n + "_URL", () -> url);
		}
	}

	/** Acepta el token "valido" sin hablar con Keycloak. */
	@TestConfiguration
	static class JwtFalso {
		@Bean
		@Primary
		JwtDecoder jwtDecoder() {
			return token -> {
				if (!"valido".equals(token)) throw new org.springframework.security.oauth2.jwt.BadJwtException("token invalido");
				return Jwt.withTokenValue(token).header("alg", "none").subject("u1").issuedAt(Instant.now())
						.expiresAt(Instant.now().plusSeconds(600)).build();
			};
		}
	}

	@Value("${local.server.port}") int port;
	final HttpClient http = HttpClient.newHttpClient();

	HttpResponse<String> get(String ruta, Map<String, String> cabeceras) throws Exception {
		HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + ruta)).GET();
		cabeceras.forEach(b::header);
		return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
	}

	static final Map<String, String> CON_TOKEN = Map.of("Authorization", "Bearer valido");

	@Test
	void cadaPrefijoLlegaASuServicio() throws Exception {
		List<String> rutas = List.of("/api/pacientes", "/api/especialidades", "/api/medicos", "/api/historias/x", "/api/citas/disponibilidad",
				"/api/imagenes", "/api/inteligencia/alertas", "/graphql", "/api/notificaciones", "/api/facturacion/facturas",
				"/api/identidad/usuarios", "/api/salud");
		for (String ruta : rutas) {
			HttpResponse<String> r = get(ruta, CON_TOKEN);
			assertThat(r.statusCode()).as(ruta).isEqualTo(200);
			assertThat(r.body()).as(ruta).contains("\"path\":\"" + ruta + "\"").contains("\"auth\":\"true\"");
		}
	}

	@Test
	void sinTokenEs401ProblemJsonConCorrelacion() throws Exception {
		HttpResponse<String> r = get("/api/pacientes", Map.of("X-Correlation-Id", "corr-9"));
		assertThat(r.statusCode()).isEqualTo(401);
		assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
		assertThat(r.headers().firstValue("X-Correlation-Id")).contains("corr-9");
		assertThat(r.body()).contains("\"code\":\"NO_AUTENTICADO\"").contains("\"status\":401").contains("\"correlationId\":\"corr-9\"");
	}

	@Test
	void tokenInvalidoTambienEs401ProblemJson() throws Exception {
		HttpResponse<String> r = get("/api/citas", Map.of("Authorization", "Bearer basura"));
		assertThat(r.statusCode()).isEqualTo(401);
		assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
		assertThat(r.body()).contains("NO_AUTENTICADO");
	}

	@Test
	void elGatewayGeneraYReenviaXCorrelationId() throws Exception {
		HttpResponse<String> r = get("/api/pacientes", CON_TOKEN);
		String id = r.headers().firstValue("X-Correlation-Id").orElseThrow();
		assertThat(id).matches("[0-9a-f-]{36}");
		assertThat(r.body()).contains("\"correlation\":\"" + id + "\"");
	}

	@Test
	void respetaElXCorrelationIdDeLaPeticion() throws Exception {
		HttpResponse<String> r = get("/api/pacientes", Map.of("Authorization", "Bearer valido", "X-Correlation-Id", "mio-1"));
		assertThat(r.headers().firstValue("X-Correlation-Id")).contains("mio-1");
		assertThat(r.body()).contains("\"correlation\":\"mio-1\"");
	}

	@Test
	void corsPreflightPermiteLasCabecerasDeSigec() throws Exception {
		HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/citas"))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
				.header("Origin", "http://localhost:5173").header("Access-Control-Request-Method", "POST")
				.header("Access-Control-Request-Headers", "authorization,idempotency-key,if-match,x-correlation-id").build();
		HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
		assertThat(r.statusCode()).isEqualTo(200);
		assertThat(r.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:5173");
		String permitidas = r.headers().firstValue("Access-Control-Allow-Headers").orElse("").toLowerCase();
		assertThat(permitidas).contains("idempotency-key").contains("if-match").contains("x-correlation-id");
	}

	@Test
	void corsRechazaOrigenesNoListados() throws Exception {
		HttpResponse<String> r = get("/api/pacientes", Map.of("Authorization", "Bearer valido", "Origin", "http://malo.example"));
		assertThat(r.statusCode()).isEqualTo(403);
	}

	@Test
	void corsExponeLasCabecerasQueElFrontendNecesita() throws Exception {
		HttpResponse<String> r = get("/api/pacientes", Map.of("Authorization", "Bearer valido", "Origin", "http://localhost:5173"));
		String expuestas = r.headers().firstValue("Access-Control-Expose-Headers").orElse("").toLowerCase();
		assertThat(expuestas).contains("idempotent-replay").contains("x-correlation-id").contains("etag");
	}

	@Test
	void saludPublicaDelGateway() throws Exception {
		assertThat(get("/actuator/health", Map.of()).statusCode()).isEqualTo(200);
	}
}
