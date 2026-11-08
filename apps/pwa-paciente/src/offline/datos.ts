import type { ClienteApi } from '@sigec/api-client'
import { ApiError } from '@sigec/api-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { useApi } from '../api'
import { guardar, leer } from './idb'

export interface Lectura<T> {
  datos: T | undefined
  cargando: boolean
  error: ApiError | null
  /** true si se muestra la copia guardada porque no hubo respuesta del servidor. */
  desactualizado: boolean
  /** Momento (ms) de la copia que se muestra. */
  guardadoEn: number | undefined
  recargar: () => void
}

interface Copia<T> { clave: string; valor: T; en: number }

/**
 * Lectura con copia local: si el servidor responde se guarda la copia; si no hay red (o falla) se muestra la ultima copia, marcada
 * como desactualizada. La copia es por usuario. Pasar `clave = null` deja la lectura en espera.
 */
export function useDatos<T>(clave: string | null, cargar: (api: ClienteApi, signal: AbortSignal) => Promise<T>): Lectura<T> {
  const api = useApi()
  const sub = useAuth().user?.profile.sub ?? 'anonimo'
  const [estado, setEstado] = useState<Omit<Lectura<T>, 'recargar'>>({ datos: undefined, cargando: clave !== null, error: null, desactualizado: false, guardadoEn: undefined })
  const [version, setVersion] = useState(0)
  const cargarRef = useRef(cargar)
  cargarRef.current = cargar

  useEffect(() => {
    if (clave === null) return
    const ctl = new AbortController()
    const llave = `${sub}:${clave}`
    void (async () => {
      setEstado((e) => ({ ...e, cargando: true, error: null }))
      try {
        const valor = await cargarRef.current(api, ctl.signal)
        if (ctl.signal.aborted) return
        const en = Date.now()
        void guardar<Copia<T>>('cache', { clave: llave, valor, en })
        setEstado({ datos: valor, cargando: false, error: null, desactualizado: false, guardadoEn: en })
      } catch (e) {
        if (ctl.signal.aborted) return
        const err = e instanceof ApiError ? e : new ApiError(0, undefined, e instanceof Error ? e.message : 'Error')
        const copia = err.estado === 0 || err.estado >= 500 ? await leer<Copia<T>>('cache', llave) : undefined
        if (copia) setEstado({ datos: copia.valor, cargando: false, error: null, desactualizado: true, guardadoEn: copia.en })
        else setEstado((s) => ({ ...s, cargando: false, error: err }))
      }
    })()
    return () => ctl.abort()
  }, [api, clave, sub, version])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { ...estado, recargar }
}

/** Ultima sincronizacion conocida (la copia mas reciente de cualquier lectura). */
export function ahoraTexto(ms: number | undefined): string {
  return ms ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '—'
}
