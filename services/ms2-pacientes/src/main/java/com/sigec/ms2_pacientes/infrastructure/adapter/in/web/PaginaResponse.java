package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.util.List;

import com.sigec.ms2_pacientes.application.Pagina;

/** Forma de las listas de SIGEC: {@code {items, siguiente}}. */
public record PaginaResponse<T>(List<T> items, String siguiente) {

	public static <D, R> PaginaResponse<R> de(Pagina<D> pagina, java.util.function.Function<D, R> mapa) {
		return new PaginaResponse<>(pagina.items().stream().map(mapa).toList(), pagina.siguiente());
	}
}
