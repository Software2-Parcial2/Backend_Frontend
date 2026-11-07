package com.sigec.ms4_historias.infrastructure.adapter.in.web;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;

import com.sigec.ms4_historias.application.Actor;

/** Construye el {@link Actor} desde el JWT: rol de mayor privilegio y claims paciente_id / medico_id. */
final class ActorJwt {

	private static final List<String> ORDEN = List.of("administrador", "medico", "recepcion", "caja", "paciente");

	private ActorJwt() {
	}

	static Actor de(Authentication auth) {
		Jwt jwt = (Jwt) auth.getPrincipal();
		String rol = ORDEN.stream().filter(r -> auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + r))).findFirst()
				.orElse("desconocido");
		return new Actor(jwt.getSubject(), rol, uuid(jwt.getClaimAsString("paciente_id")), uuid(jwt.getClaimAsString("medico_id")));
	}

	private static UUID uuid(String s) {
		try {
			return s == null ? null : UUID.fromString(s);
		}
		catch (IllegalArgumentException e) {
			return null;
		}
	}
}
