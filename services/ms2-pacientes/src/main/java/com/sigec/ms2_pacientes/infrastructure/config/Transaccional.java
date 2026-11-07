package com.sigec.ms2_pacientes.infrastructure.config;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;

import org.springframework.transaction.support.TransactionTemplate;

/**
 * Ejecuta cada llamada a un caso de uso (application, sin Spring) dentro de una transaccion: asi el cambio de negocio y la
 * escritura del outbox se confirman juntos y cualquier excepcion los revierte.
 */
final class Transaccional {

	private Transaccional() {
	}

	@SuppressWarnings("unchecked")
	static <T> T envolver(Class<T> puerto, T servicio, TransactionTemplate tx) {
		return (T) Proxy.newProxyInstance(puerto.getClassLoader(), new Class<?>[] { puerto }, (proxy, metodo, args) -> {
			try {
				return tx.execute(status -> {
					try {
						return metodo.invoke(servicio, args);
					}
					catch (InvocationTargetException e) {
						sneaky(e.getCause());
						return null;
					}
					catch (IllegalAccessException e) {
						throw new IllegalStateException(e);
					}
				});
			}
			catch (RuntimeException e) {
				throw e;
			}
		});
	}

	@SuppressWarnings("unchecked")
	private static <E extends Throwable> void sneaky(Throwable t) throws E {
		throw (E) t;
	}
}
