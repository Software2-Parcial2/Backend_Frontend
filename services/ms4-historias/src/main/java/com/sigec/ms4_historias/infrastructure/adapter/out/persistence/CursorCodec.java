package com.sigec.ms4_historias.infrastructure.adapter.out.persistence;

import java.util.Base64;
import java.util.Map;

import com.sigec.ms4_historias.domain.exception.CursorInvalidoException;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Cursor opaco = JSON en base64url (misma forma que los servicios Nest y Laravel). */
final class CursorCodec {

	private static final ObjectMapper MAPPER = new ObjectMapper();

	private CursorCodec() {
	}

	static String codificar(Map<String, String> clave) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(MAPPER.writeValueAsBytes(clave));
	}

	/** @throws CursorInvalidoException si esta mal formado o le faltan las claves esperadas */
	static Map<String, String> decodificar(String cursor, String... clavesRequeridas) {
		try {
			Map<String, String> m = MAPPER.readValue(Base64.getUrlDecoder().decode(cursor), new TypeReference<Map<String, String>>() {
			});
			for (String k : clavesRequeridas) {
				if (m == null || m.get(k) == null) {
					throw new CursorInvalidoException();
				}
			}
			return m;
		}
		catch (CursorInvalidoException e) {
			throw e;
		}
		catch (RuntimeException e) {
			throw new CursorInvalidoException();
		}
	}
}
