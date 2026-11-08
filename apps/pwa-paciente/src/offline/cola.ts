import { ApiError, esperarCita, nuevoUuid, type ClienteApi } from '@sigec/api-client'
import { useEffect, useSyncExternalStore } from 'react'
import { borrar, guardar, todos } from './idb'

/**
 * Cola de solicitudes de cita hechas sin conexion (o antes de que el servidor responda). Cada una lleva SU Idempotency-Key desde que se crea:
 * si el envio se corta a medias y se reintenta, el servidor devuelve la misma cita en lugar de crear otra. Las claves valen 24 horas.
 */
export type EstadoSolicitud = 'PENDIENTE' | 'ENVIANDO' | 'CONFIRMANDO' | 'CONFIRMADA' | 'CONFLICTO' | 'CADUCADA'

export interface Solicitud {
  id: string
  clave: string
  cuerpo: { pacienteId: string; medicoId: string; especialidad: string; fechaHora: string }
  resumen: { especialidad: string; medico: string }
  estado: EstadoSolicitud
  creada: number
  intentos: number
  citaId?: string
  error?: string
}

export const VIGENCIA_CLAVE_MS = 24 * 3_600_000

let instantanea: Solicitud[] = []
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())
async function refrescar() {
  instantanea = (await todos<Solicitud>('cola')).sort((a, b) => a.creada - b.creada)
  avisar()
}
async function actualizar(s: Solicitud, cambios: Partial<Solicitud>) {
  Object.assign(s, cambios)
  await guardar('cola', s)
  await refrescar()
}

export async function agregarSolicitud(cuerpo: Solicitud['cuerpo'], resumen: Solicitud['resumen']): Promise<Solicitud> {
  const s: Solicitud = { id: nuevoUuid(), clave: nuevoUuid(), cuerpo, resumen, estado: 'PENDIENTE', creada: Date.now(), intentos: 0 }
  await guardar('cola', s)
  await refrescar()
  return s
}
/** Solo para pruebas: lee la cola tal como esta guardada. */
export async function listarParaPrueba(): Promise<Solicitud[]> { await refrescar(); return instantanea }

export async function descartarSolicitud(id: string) { await borrar('cola', id); await refrescar() }
export async function reintentarSolicitud(id: string) {
  const s = instantanea.find((x) => x.id === id)
  if (!s) return
  // Una solicitud en conflicto o caducada es otra intencion: clave nueva.
  await actualizar(s, { estado: 'PENDIENTE', error: undefined, clave: nuevoUuid(), creada: Date.now(), citaId: undefined })
}

let enCurso = false
/** Envia lo pendiente, en orden. Seguro de llamar muchas veces: solo corre una a la vez. */
export async function procesarCola(api: ClienteApi): Promise<void> {
  if (enCurso) return
  enCurso = true
  try {
    await refrescar()
    for (const s of [...instantanea]) {
      if (s.estado === 'CONFIRMADA' || s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') continue
      if (s.estado === 'PENDIENTE' && Date.now() - s.creada > VIGENCIA_CLAVE_MS) {
        await actualizar(s, { estado: 'CADUCADA', error: 'Pasaron más de 24 horas: vuelva a solicitar la cita.' })
        continue
      }
      try {
        if (!s.citaId) {
          await actualizar(s, { estado: 'ENVIANDO', intentos: s.intentos + 1, error: undefined })
          const r = await api.post<{ citaId: string }>('/api/citas', s.cuerpo, { clave: s.clave })
          await actualizar(s, { estado: 'CONFIRMANDO', citaId: r.citaId })
        }
        const c = await esperarCita(api, s.citaId!, { maxMs: 30_000 })
        if (c.estado === 'CANCELADA' || c.estado === 'CANCELADA_USUARIO') await actualizar(s, { estado: 'CONFLICTO', error: c.motivoFallo ?? 'La cita no pudo confirmarse.' })
        else await actualizar(s, { estado: 'CONFIRMADA' })
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TIEMPO_AGOTADO') await actualizar(s, { estado: 'CONFIRMANDO', error: 'El servidor sigue procesando la cita.' })
        else if (e instanceof ApiError && (e.estado === 409 || e.estado === 422 || e.estado === 400)) await actualizar(s, { estado: 'CONFLICTO', error: e.estado === 409 ? 'Ese horario ya no está disponible. Elija otro turno.' : (e.detalle ?? e.message) })
        else await actualizar(s, { estado: s.citaId ? 'CONFIRMANDO' : 'PENDIENTE', error: e instanceof ApiError && e.estado === 0 ? 'Sin conexión: se enviará al volver.' : (e instanceof Error ? e.message : 'Error al enviar') })
        if (e instanceof ApiError && (e.estado === 0 || e.estado === 401)) break // sin red o sin sesion: el resto tampoco saldra
      }
    }
  } finally {
    enCurso = false
  }
}

/** Solicitudes de la cola, actualizadas cuando cambian. Procesa la cola al abrir, al volver la conexion y cada 20 s. */
export function useCola(api: ClienteApi): Solicitud[] {
  const lista = useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f) }, () => instantanea)
  useEffect(() => {
    void procesarCola(api)
    const alVolver = () => void procesarCola(api)
    window.addEventListener('online', alVolver)
    const t = setInterval(() => { if (navigator.onLine) void procesarCola(api) }, 20_000)
    return () => { window.removeEventListener('online', alVolver); clearInterval(t) }
  }, [api])
  return lista
}
