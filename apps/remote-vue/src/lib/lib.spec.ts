import { describe, expect, it } from 'vitest'
import { formatearCelda, opcionGrafico } from './graficos'
import { rangoDias } from './consultas'
import { elegirEstrategia, tipoGrabacion } from './voz'

describe('estrategia de voz', () => {
  it('Web Speech si hay conexion y el navegador la soporta', () => {
    expect(elegirEstrategia({ webSpeech: true, grabadora: true, enLinea: true })).toBe('web-speech')
  })
  it('sin conexion usa grabadora + Whisper', () => {
    expect(elegirEstrategia({ webSpeech: true, grabadora: true, enLinea: false })).toBe('whisper')
  })
  it('sin Web Speech (p. ej. Firefox) usa grabadora + Whisper aunque haya conexion', () => {
    expect(elegirEstrategia({ webSpeech: false, grabadora: true, enLinea: true })).toBe('whisper')
  })
  it('sin ninguna de las dos no ofrece voz', () => {
    expect(elegirEstrategia({ webSpeech: false, grabadora: false, enLinea: true })).toBe('ninguna')
    expect(elegirEstrategia({ webSpeech: true, grabadora: false, enLinea: false })).toBe('ninguna')
  })
  it('elige el primer tipo de grabacion soportado', () => {
    expect(tipoGrabacion((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(tipoGrabacion(() => true)).toBe('audio/webm;codecs=opus')
    expect(tipoGrabacion(() => false)).toBeUndefined()
  })
})

describe('graficos', () => {
  const columnas = [{ clave: 'clave', titulo: 'Grupo', tipo: 'texto' as const }, { clave: 'total', titulo: 'Citas', tipo: 'numero' as const }]
  const filas = [{ clave: 'Pediatria', total: 40 }, { clave: 'Cardiologia', total: 25 }]
  it('barras y lineas', () => {
    const b = opcionGrafico({ filas, columnas, grafico: { tipo: 'barras', x: 'clave', y: 'total' } }) as any
    expect(b.xAxis.data).toEqual(['Pediatria', 'Cardiologia'])
    expect(b.series[0]).toMatchObject({ type: 'bar', data: [40, 25], name: 'Citas' })
    expect((opcionGrafico({ filas, columnas, grafico: { tipo: 'lineas', x: 'clave', y: 'total' } }) as any).series[0].type).toBe('line')
  })
  it('torta', () => {
    const t = opcionGrafico({ filas, columnas, grafico: { tipo: 'torta', x: 'clave', y: 'total' } }) as any
    expect(t.series[0].data).toEqual([{ name: 'Pediatria', value: 40 }, { name: 'Cardiologia', value: 25 }])
  })
  it('sin grafico, sin ejes o sin filas -> null', () => {
    expect(opcionGrafico({ filas, columnas, grafico: { tipo: 'ninguno' } })).toBeNull()
    expect(opcionGrafico({ filas, columnas, grafico: { tipo: 'barras' } })).toBeNull()
    expect(opcionGrafico({ filas: [], columnas, grafico: { tipo: 'barras', x: 'clave', y: 'total' } })).toBeNull()
  })
  it('formatea celdas', () => {
    expect(formatearCelda(null, 'texto')).toBe('—')
    expect(formatearCelda(0.4567, 'porcentaje')).toBe('45.7 %')
    expect(formatearCelda('x', 'texto')).toBe('x')
  })
})

describe('consultas', () => {
  it('rango: desde hace N dias hasta 30 dias despues', () => {
    expect(rangoDias(90, new Date('2026-06-30T12:00:00Z'))).toEqual({ desde: '2026-04-01', hasta: '2026-07-30' })
  })
})
