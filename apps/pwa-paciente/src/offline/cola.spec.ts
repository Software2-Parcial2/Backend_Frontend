import { ApiError, type ClienteApi } from '@sigec/api-client'
import { describe, expect, it, vi } from 'vitest'
import { agregarSolicitud, listarParaPrueba, procesarCola, reintentarSolicitud, VIGENCIA_CLAVE_MS } from './cola'

const cuerpo = { pacienteId: 'p1', medicoId: 'm1', especialidad: 'general', fechaHora: '2026-12-01T12:00:00Z' }
const resumen = { especialidad: 'general', medico: 'Dr. Prueba' }

function apiFalsa(post: ClienteApi['post'], get?: ClienteApi['get']): ClienteApi {
  return { post, get: get ?? (async () => ({ citaId: 'c1', estado: 'CONFIRMADA' }) as never) } as unknown as ClienteApi
}

describe('cola de solicitudes de cita', () => {
  it('sin conexion queda PENDIENTE y reintenta con la MISMA clave', async () => {
    const claves: (string | false | undefined)[] = []
    let falla = true
    const post = vi.fn(async (_r: string, _b: unknown, op?: { clave?: string | false }) => {
      claves.push(op?.clave)
      if (falla) throw new ApiError(0, undefined, 'sin red')
      return { citaId: 'c1' }
    })
    const s = await agregarSolicitud(cuerpo, resumen)
    const api = apiFalsa(post as never)
    await procesarCola(api)
    expect((await listarParaPrueba()).find((x) => x.id === s.id)?.estado).toBe('PENDIENTE')
    falla = false
    await procesarCola(api)
    const fin = (await listarParaPrueba()).find((x) => x.id === s.id)!
    expect(fin.estado).toBe('CONFIRMADA')
    expect(fin.citaId).toBe('c1')
    expect(new Set(claves).size).toBe(1) // la misma clave en ambos envios
    expect(claves[0]).toBe(s.clave)
  })

  it('409 del servidor = CONFLICTO con mensaje claro, y reintentar genera clave nueva', async () => {
    const post = vi.fn(async () => { throw new ApiError(409, { code: 'HORARIO_OCUPADO', detail: 'ocupado' }) })
    const s = await agregarSolicitud({ ...cuerpo, fechaHora: '2026-12-02T12:00:00Z' }, resumen)
    const claveInicial = s.clave
    await procesarCola(apiFalsa(post as never))
    const c = (await listarParaPrueba()).find((x) => x.id === s.id)!
    expect(c.estado).toBe('CONFLICTO')
    expect(c.error).toContain('ya no está disponible')
    await reintentarSolicitud(s.id)
    const r = (await listarParaPrueba()).find((x) => x.id === s.id)!
    expect(r.estado).toBe('PENDIENTE')
    expect(r.clave).not.toBe(claveInicial)
  })

  it('una solicitud pendiente de mas de 24 h caduca (la clave ya no vale)', async () => {
    const s = await agregarSolicitud({ ...cuerpo, fechaHora: '2026-12-03T12:00:00Z' }, resumen)
    const ahora = Date.now
    Date.now = () => ahora() + VIGENCIA_CLAVE_MS + 1000
    try {
      const post = vi.fn()
      await procesarCola(apiFalsa(post as never))
      expect(post).not.toHaveBeenCalled()
      expect((await listarParaPrueba()).find((x) => x.id === s.id)?.estado).toBe('CADUCADA')
    } finally {
      Date.now = ahora
    }
  })

  it('si la SAGA cancela la cita queda CONFLICTO con el motivo', async () => {
    const post = vi.fn(async () => ({ citaId: 'c9' }))
    const get = vi.fn(async () => ({ citaId: 'c9', estado: 'CANCELADA', motivoFallo: 'Sin cupo' }))
    const s = await agregarSolicitud({ ...cuerpo, fechaHora: '2026-12-04T12:00:00Z' }, resumen)
    await procesarCola(apiFalsa(post as never, get as never))
    const c = (await listarParaPrueba()).find((x) => x.id === s.id)!
    expect(c.estado).toBe('CONFLICTO')
    expect(c.error).toBe('Sin cupo')
  })
})
