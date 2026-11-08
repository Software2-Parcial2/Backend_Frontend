import { ApiError, type ClienteApi } from '@sigec/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api';
import { useSesion } from '../sesion';
import { db } from './db';

export interface Lectura<T> {
  datos: T | undefined; cargando: boolean; error: ApiError | null;
  /** true si se muestra la copia guardada porque el servidor no respondio. */
  desactualizado: boolean; guardadoEn: number | undefined; recargar: () => void;
}

/** Lectura con copia en SQLite (por usuario): sin red muestra la ultima copia marcada como desactualizada. `clave = null` la deja en espera. */
export function useDatos<T>(clave: string | null, cargar: (api: ClienteApi, signal: AbortSignal) => Promise<T>): Lectura<T> {
  const api = useApi();
  const sub = useSesion().sub || 'anonimo';
  const [estado, setEstado] = useState<Omit<Lectura<T>, 'recargar'>>({ datos: undefined, cargando: clave !== null, error: null, desactualizado: false, guardadoEn: undefined });
  const [version, setVersion] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    if (clave === null) return;
    const ctl = new AbortController();
    const llave = `${sub}:${clave}`;
    void (async () => {
      setEstado((e) => ({ ...e, cargando: true, error: null }));
      try {
        const valor = await cargarRef.current(api, ctl.signal);
        if (ctl.signal.aborted) return;
        const en = Date.now();
        void db().then((d) => d.runAsync('INSERT OR REPLACE INTO cache (clave, valor, en) VALUES (?, ?, ?)', [llave, JSON.stringify(valor), en]));
        setEstado({ datos: valor, cargando: false, error: null, desactualizado: false, guardadoEn: en });
      } catch (e) {
        if (ctl.signal.aborted) return;
        const err = e instanceof ApiError ? e : new ApiError(0, undefined, e instanceof Error ? e.message : 'Error');
        const fila = err.estado === 0 || err.estado >= 500 ? await (await db()).getFirstAsync<{ valor: string; en: number }>('SELECT valor, en FROM cache WHERE clave = ?', [llave]) : null;
        if (fila) setEstado({ datos: JSON.parse(fila.valor) as T, cargando: false, error: null, desactualizado: true, guardadoEn: fila.en });
        else setEstado((s) => ({ ...s, cargando: false, error: err }));
      }
    })();
    return () => ctl.abort();
  }, [api, clave, sub, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}
