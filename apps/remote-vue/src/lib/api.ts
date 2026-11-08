import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'
import { ApiError, crearCliente as crearClienteHttp, type ClienteApi, type Problema } from '@sigec/api-client'
import type { MfeContext } from '@sigec/mfe-contract'

export { ApiError }
export type { ClienteApi }

/** Base del gateway. Se puede cambiar al compilar con VITE_API_URL. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8090'

export type ObtenerToken = () => string

/** Cliente GraphQL (solo MS7 usa GraphQL). El token se lee en cada peticion para tolerar renovaciones. */
export function crearCliente(token: ObtenerToken, baseUrl = API_URL): ApolloClient {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: `${baseUrl}/graphql`,
      fetch: (uri, init) => fetch(uri, { ...init, headers: { ...(init?.headers as Record<string, string>), Authorization: `Bearer ${token()}` } }),
    }),
    defaultOptions: { query: { fetchPolicy: 'no-cache' } },
  })
}

/** Lee un `application/problem+json` (o un cuerpo de otro formato) y lo convierte en el ApiError comun. */
async function leerError(res: Response): Promise<ApiError> {
  const cuerpo = (await res.json().catch(() => ({}))) as Problema & { message?: string | string[] }
  const msg = Array.isArray(cuerpo.message) ? cuerpo.message.join('; ') : cuerpo.message
  return new ApiError(res.status, cuerpo, msg ?? `Error ${res.status}`)
}

/** Cliente REST de la clinica: lee el token y la `apiUrl` del contexto del shell en cada peticion. */
export function crearApi(contexto: () => MfeContext | undefined): ClienteApi {
  return crearClienteHttp({
    baseUrl: () => contexto()?.apiUrl ?? API_URL,
    token: () => contexto()?.token,
  })
}

export interface ReporteResultado {
  titulo: string
  fuente: string
  generadoEn: string
  columnas: { clave: string; titulo: string; tipo: 'texto' | 'numero' | 'moneda' | 'fecha' | 'porcentaje' }[]
  filas: Record<string, string | number | null>[]
  grafico: { tipo: 'barras' | 'lineas' | 'torta' | 'ninguno'; x?: string; y?: string }
  especificacion: unknown
  sintetico: boolean
  nota?: string
}

export interface RespuestaAgente {
  respuesta: string
  herramientasUsadas: { nombre: string; argumentos: unknown; ok: boolean; ms: number }[]
  reporte: ReporteResultado | null
  incompleta: boolean
  proveedor: string
  modelo: string
  transcripcion?: { texto: string; idioma: string; duracionS: number }
}

export async function consultarTexto(token: string, texto: string, baseUrl = API_URL): Promise<RespuestaAgente> {
  const res = await fetch(`${baseUrl}/api/inteligencia/agente/consulta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  })
  if (!res.ok) throw await leerError(res)
  return (await res.json()) as RespuestaAgente
}

/** Sube el audio al endpoint de MS7 (que lo transcribe con Whisper y consulta al agente). */
export async function consultarVoz(token: string, audio: Blob, baseUrl = API_URL): Promise<RespuestaAgente> {
  const form = new FormData()
  form.append('audio', audio, 'consulta.webm')
  const res = await fetch(`${baseUrl}/api/inteligencia/agente/voz`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  if (!res.ok) throw await leerError(res)
  return (await res.json()) as RespuestaAgente
}

export type FormatoExportacion = 'xlsx' | 'csv' | 'pdf'

/** Pide a MS7 el reporte en el formato indicado y devuelve el archivo para descargar. */
export async function exportarReporte(token: string, especificacion: unknown, formato: FormatoExportacion, baseUrl = API_URL): Promise<{ blob: Blob; nombre: string }> {
  const res = await fetch(`${baseUrl}/api/inteligencia/reportes?formato=${formato}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(especificacion),
  })
  if (!res.ok) throw await leerError(res)
  const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `reporte.${formato}`
  return { blob: await res.blob(), nombre }
}

export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}
