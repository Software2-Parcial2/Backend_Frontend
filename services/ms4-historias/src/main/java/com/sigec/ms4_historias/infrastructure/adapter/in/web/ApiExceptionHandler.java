package com.sigec.ms4_historias.infrastructure.adapter.in.web;

import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.sigec.ms4_historias.infrastructure.adapter.in.web.problem.ProblemaBase;

/**
 * Errores de MS4 como problem+json. Lo generico (validacion, 401/403, 404, 500) vive en {@link ProblemaBase};
 * los casos de dominio (version en conflicto, consentimiento, etc.) se agregan aqui cuando existan.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ProblemaBase {
}
