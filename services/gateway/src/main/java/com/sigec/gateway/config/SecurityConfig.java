package com.sigec.gateway.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import com.sigec.gateway.web.ProblemJsonSecurityHandlers;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		ProblemJsonSecurityHandlers problemas = new ProblemJsonSecurityHandlers();
		return http
				.csrf(AbstractHttpConfigurer::disable)
				.cors(Customizer.withDefaults())
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
						.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
						.anyRequest().authenticated())
				.exceptionHandling(e -> e.authenticationEntryPoint(problemas).accessDeniedHandler(problemas))
				.oauth2ResourceServer(oauth2 -> oauth2
						.authenticationEntryPoint(problemas).accessDeniedHandler(problemas)
						.jwt(Customizer.withDefaults()))
				.build();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(
			@Value("${sigec.cors.allowed-origins}") List<String> allowedOrigins) {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", "If-Match", "X-Correlation-Id", "Accept-Language"));
		// El navegador solo deja leer estas cabeceras de respuesta si se exponen (contracts/idempotency.md).
		config.setExposedHeaders(List.of("Idempotent-Replay", "Retry-After", "Location", "ETag", "X-Correlation-Id"));
		config.setMaxAge(3600L);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
