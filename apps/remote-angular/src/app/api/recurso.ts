import { DestroyRef, computed, effect, inject, signal, untracked, type Signal } from '@angular/core';
import { ApiError, esAbortado, type ClienteApi } from '@sigec/api-client';
import { ApiService } from './api.service';

/** Una lectura con sus tres estados. `datos` conserva el ultimo valor mientras se recarga. */
export interface Recurso<T> {
  readonly datos: Signal<T | undefined>;
  readonly cargando: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  recargar(): void;
}

function aApiError(e: unknown): ApiError {
  return e instanceof ApiError ? e : new ApiError(0, undefined, e instanceof Error ? e.message : 'Ocurrio un error inesperado');
}

/**
 * Lectura reactiva: `cargar` se ejecuta de nuevo cuando cambia cualquier signal que lea de forma sincrona (la busqueda, el id de la
 * ruta...). Si devuelve `null` queda en espera (faltan parametros). Cancela la peticion anterior y la del destino al salir.
 * Debe llamarse en un contexto de inyeccion (campo de la clase o constructor).
 */
export function recurso<T>(cargar: (api: ClienteApi, signal: AbortSignal) => Promise<T> | null): Recurso<T> {
  const api = inject(ApiService).cliente;
  const datos = signal<T | undefined>(undefined);
  const cargando = signal(false);
  const error = signal<ApiError | null>(null);
  const version = signal(0);
  let actual: AbortController | undefined;

  effect(() => {
    version();
    actual?.abort();
    const ctl = new AbortController();
    actual = ctl;
    const promesa = cargar(api, ctl.signal); // aqui se leen (y se rastrean) los signals de los que depende
    untracked(() => {
      if (promesa === null) {
        cargando.set(false);
        return;
      }
      cargando.set(true);
      error.set(null);
      promesa.then(
        (d) => {
          if (ctl.signal.aborted) return;
          datos.set(d);
          cargando.set(false);
        },
        (e) => {
          if (ctl.signal.aborted || esAbortado(e)) return;
          error.set(aApiError(e));
          cargando.set(false);
        },
      );
    });
  });
  inject(DestroyRef).onDestroy(() => actual?.abort());

  return { datos: datos.asReadonly(), cargando: cargando.asReadonly(), error: error.asReadonly(), recargar: () => version.update((v) => v + 1) };
}

/** Una accion (guardar, cobrar, cancelar...) con su estado; `ejecutar` devuelve el resultado o `undefined` si fallo (el error queda en `error`). */
export interface Accion<A extends unknown[], R> {
  readonly enCurso: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  ejecutar(...args: A): Promise<R | undefined>;
  limpiar(): void;
}

export function accion<A extends unknown[], R>(fn: (api: ClienteApi, ...args: A) => Promise<R>): Accion<A, R> {
  const api = inject(ApiService).cliente;
  const enCurso = signal(false);
  const error = signal<ApiError | null>(null);
  return {
    enCurso: enCurso.asReadonly(),
    error: error.asReadonly(),
    limpiar: () => error.set(null),
    async ejecutar(...args: A) {
      enCurso.set(true);
      error.set(null);
      try {
        return await fn(api, ...args);
      } catch (e) {
        if (!esAbortado(e)) error.set(aApiError(e));
        return undefined;
      } finally {
        enCurso.set(false);
      }
    },
  };
}

/** Valor que sigue a `fuente` con retraso (para buscar mientras se escribe sin una peticion por tecla). */
export function conRetraso<T>(fuente: Signal<T>, ms = 300): Signal<T> {
  const valor = signal(fuente());
  let t: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const v = fuente();
    clearTimeout(t);
    t = setTimeout(() => valor.set(v), ms);
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(t));
  return valor.asReadonly();
}

/** Lista con cursor: carga la primera pagina cuando cambian sus parametros y `cargarMas()` agrega la siguiente. */
export interface Lista<T> {
  readonly items: Signal<T[]>;
  readonly cargando: Signal<boolean>;
  readonly cargandoMas: Signal<boolean>;
  readonly error: Signal<ApiError | null>;
  readonly hayMas: Signal<boolean>;
  cargarMas(): void;
  recargar(): void;
}

export interface FuenteLista {
  ruta: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}

export function lista<T>(fuente: () => FuenteLista | null, limite = 25): Lista<T> {
  const api = inject(ApiService).cliente;
  const items = signal<T[]>([]);
  const cargando = signal(false);
  const cargandoMas = signal(false);
  const error = signal<ApiError | null>(null);
  const siguiente = signal<string | null>(null);
  const version = signal(0);
  let actual: AbortController | undefined;
  let ultima: FuenteLista | null = null;

  effect(() => {
    version();
    actual?.abort();
    const ctl = new AbortController();
    actual = ctl;
    const f = fuente(); // rastrea los signals de los que depende
    untracked(() => {
      ultima = f;
      items.set([]);
      siguiente.set(null);
      if (f === null) {
        cargando.set(false);
        return;
      }
      cargando.set(true);
      error.set(null);
      api.pagina<T>(f.ruta, { query: f.query, limite, signal: ctl.signal }).then(
        (p) => {
          if (ctl.signal.aborted) return;
          items.set(p.items);
          siguiente.set(p.siguiente);
          cargando.set(false);
        },
        (e) => {
          if (ctl.signal.aborted || esAbortado(e)) return;
          error.set(aApiError(e));
          cargando.set(false);
        },
      );
    });
  });
  inject(DestroyRef).onDestroy(() => actual?.abort());

  return {
    items: items.asReadonly(),
    cargando: cargando.asReadonly(),
    cargandoMas: cargandoMas.asReadonly(),
    error: error.asReadonly(),
    hayMas: computed(() => siguiente() !== null),
    recargar: () => version.update((v) => v + 1),
    cargarMas() {
      const cursor = siguiente();
      const f = ultima;
      if (!cursor || !f || cargandoMas()) return;
      const ctl = actual;
      cargandoMas.set(true);
      api.pagina<T>(f.ruta, { query: f.query, limite, cursor, signal: ctl?.signal }).then(
        (p) => {
          if (ctl?.signal.aborted) return;
          items.update((x) => [...x, ...p.items]);
          siguiente.set(p.siguiente);
          cargandoMas.set(false);
        },
        (e) => {
          if (esAbortado(e)) return;
          error.set(aApiError(e));
          cargandoMas.set(false);
        },
      );
    },
  };
}
