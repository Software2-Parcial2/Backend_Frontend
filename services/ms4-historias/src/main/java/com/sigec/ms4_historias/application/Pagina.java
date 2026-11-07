package com.sigec.ms4_historias.application;

import java.util.List;
import java.util.function.Function;

/** Pagina de resultados con el cursor opaco de la siguiente (null si no hay mas). */
public record Pagina<T>(List<T> items, String siguiente) {

	public <R> Pagina<R> mapear(Function<T, R> f) {
		return new Pagina<>(items.stream().map(f).toList(), siguiente);
	}
}
