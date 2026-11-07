package com.sigec.ms2_pacientes.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.beans.factory.annotation.Value;

import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.problem.ProblemJsonSecurityHandlers;
import com.sigec.ms2_pacientes.infrastructure.idempotency.IdempotencyFilter;
import com.sigec.ms2_pacientes.infrastructure.idempotency.IdempotencyStore;

import java.time.Duration;

import tools.jackson.databind.ObjectMapper;

/** El CORS lo gestiona solo el gateway. */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, IdempotencyStore idempotencyStore, ObjectMapper mapper,
			@Value("${sigec.idempotency.ttl-hours:24}") long ttlHours) throws Exception {
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(new KeycloakRealmRoleConverter());
		ProblemJsonSecurityHandlers problemas = new ProblemJsonSecurityHandlers(mapper);
		return http
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
						.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
						// Antes del controlador: sin esto la validacion del cuerpo (400) se evalua antes que @PreAuthorize (403).
						.requestMatchers(HttpMethod.POST, "/api/pacientes").hasAnyRole("administrador", "recepcion", "medico")
						.requestMatchers(HttpMethod.PUT, "/api/pacientes/*").hasAnyRole("administrador", "recepcion")
						.requestMatchers(HttpMethod.POST, "/api/pacientes/*/contactos").hasAnyRole("administrador", "recepcion")
						.requestMatchers(HttpMethod.POST, "/api/pacientes/*/solicitudes").hasRole("paciente")
						.requestMatchers(HttpMethod.POST, "/api/pacientes/solicitudes/*/aprobar", "/api/pacientes/solicitudes/*/rechazar")
								.hasAnyRole("administrador", "recepcion")
						.requestMatchers(HttpMethod.POST, "/api/especialidades", "/api/medicos").hasRole("administrador")
						.requestMatchers(HttpMethod.PUT, "/api/especialidades/*", "/api/medicos/*").hasRole("administrador")
						.anyRequest().authenticated())
				// Despues de autenticar y autorizar: solo se reservan claves de usuarios con acceso.
				.addFilterAfter(new IdempotencyFilter(idempotencyStore, mapper, Duration.ofHours(ttlHours)), AuthorizationFilter.class)
				.exceptionHandling(e -> e.authenticationEntryPoint(problemas).accessDeniedHandler(problemas))
				.oauth2ResourceServer(oauth2 -> oauth2
						.authenticationEntryPoint(problemas).accessDeniedHandler(problemas)
						.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)))
				.build();
	}
}
