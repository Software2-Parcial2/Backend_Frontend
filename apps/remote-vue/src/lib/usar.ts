import { onBeforeUnmount, ref, shallowRef, type InjectionKey, inject, type Ref } from 'vue'
import { ApiError, type ClienteApi } from './api'

export const API_KEY: InjectionKey<ClienteApi> = Symbol('api')
export const useApi = (): ClienteApi => {
  const api = inject(API_KEY)
  if (!api) throw new Error('Falta el cliente de la API (provide)')
  return api
}

const aApiError = (e: unknown): ApiError => (e instanceof ApiError ? e : new ApiError(0, undefined, e instanceof Error ? e.message : 'Ocurrio un error inesperado'))

/** Una lectura con estados cargando / error / datos; cancela la peticion en curso al recargar y al desmontar. */
export function usarLectura<T>(cargar: (api: ClienteApi, signal: AbortSignal) => Promise<T> | null) {
  const api = useApi()
  const datos = shallowRef<T | undefined>(undefined) as Ref<T | undefined>
  const cargando = ref(false)
  const error = shallowRef<ApiError | null>(null)
  let actual: AbortController | undefined
  function recargar() {
    actual?.abort()
    const ctl = new AbortController()
    actual = ctl
    const p = cargar(api, ctl.signal)
    if (p === null) { cargando.value = false; return }
    cargando.value = true
    error.value = null
    p.then(
      (d) => { if (!ctl.signal.aborted) { datos.value = d; cargando.value = false } },
      (e) => { if (!ctl.signal.aborted) { error.value = aApiError(e); cargando.value = false } },
    )
  }
  onBeforeUnmount(() => actual?.abort())
  return { datos, cargando, error, recargar }
}

/** Una accion (guardar, atender, ejecutar) con su estado de envio y su error. */
export function usarAccion<A extends unknown[], R>(fn: (api: ClienteApi, ...args: A) => Promise<R>) {
  const api = useApi()
  const enCurso = ref(false)
  const error = shallowRef<ApiError | null>(null)
  async function ejecutar(...args: A): Promise<R | undefined> {
    enCurso.value = true
    error.value = null
    try { return await fn(api, ...args) } catch (e) { error.value = aApiError(e); return undefined } finally { enCurso.value = false }
  }
  return { enCurso, error, ejecutar }
}

/** Texto para la persona segun el tipo de fallo. */
export function textoDeError(e: ApiError): { titulo: string; texto: string } {
  switch (e.estado) {
    case 0: return { titulo: 'Sin conexión con el servidor', texto: 'Revise su red e intente de nuevo.' }
    case 403: return { titulo: 'No tiene permiso para esto', texto: 'Su rol no incluye esta operación.' }
    case 404: return { titulo: 'No se encontró', texto: e.detalle ?? 'El registro no existe.' }
    case 503: return { titulo: 'El servicio no está disponible', texto: e.detalle ?? 'Intente de nuevo en unos minutos.' }
    default: return { titulo: e.estado >= 500 ? 'Error del servidor' : 'No se pudo completar', texto: e.detalle ?? e.message }
  }
}
