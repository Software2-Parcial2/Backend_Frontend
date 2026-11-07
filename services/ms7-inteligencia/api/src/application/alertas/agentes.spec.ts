import { describe, expect, it, vi } from 'vitest';
import type { CitaConRiesgo, Identidad, IngresoPeriodo, ResumenCitas } from '../../domain/gestion.js';
import { evaluar, MIN_CITAS_CANCELACION, type Fuentes } from './agentes.js';

const ID: Identidad = { token: 't', roles: ['administrador'], usuario: 'a' };
const AHORA = Date.parse('2026-06-15T12:00:00Z');
const dia = (d: number) => new Date(AHORA - d * 86_400_000).toISOString().slice(0, 10);

const resumen = (total: number, canceladas: number, truncado = false): ResumenCitas => ({
  desde: '', hasta: '', agrupadoPor: 'ESTADO', total, truncado,
  grupos: [{ clave: 'CONFIRMADA', total: total - canceladas, confirmadas: total - canceladas, canceladas: 0 }, { clave: 'CANCELADA', total: canceladas, confirmadas: 0, canceladas }],
});
const fuentes = (o: Partial<Fuentes> = {}): Fuentes => ({
  resumenCitas: vi.fn(async () => resumen(20, 2)),
  riesgoProximasCitas: vi.fn(async () => []),
  demanda: vi.fn(async () => ({ k: 2, silueta: 0.5, fuente: 'x', sintetico: true, segmentos: [], especialidades: [] })),
  ingresos: vi.fn(async () => []),
  ...o,
});
const riesgo = (n: number, p: number): CitaConRiesgo =>
  ({ citaId: `c${n}`, fechaHora: '2026-06-16T10:00:00Z', riesgo: { probabilidad: p, riesgo: p > 0.5 ? 'ALTO' : 'BAJO', versionModelo: 'v', sintetico: true, atributosEstimados: [] } }) as unknown as CitaConRiesgo;

describe('agente cancelaciones', () => {
  const ag = { id: 'cancelaciones' as const, umbral: 0.25 };
  it('no alerta bajo el umbral ni con pocas citas', async () => {
    expect(await evaluar(ag, fuentes(), ID, AHORA)).toEqual([]);
    expect(await evaluar(ag, fuentes({ resumenCitas: async () => resumen(MIN_CITAS_CANCELACION - 1, MIN_CITAS_CANCELACION - 1) }), ID, AHORA)).toEqual([]);
  });
  it('alerta MEDIO sobre el umbral y ALTO desde 1.5 veces', async () => {
    const [m] = await evaluar(ag, fuentes({ resumenCitas: async () => resumen(20, 6) }), ID, AHORA);
    expect(m).toMatchObject({ clave: 'cancelaciones', nivel: 'MEDIO', datos: { canceladas: 6, total: 20, tasa: 0.3 } });
    const [a] = await evaluar(ag, fuentes({ resumenCitas: async () => resumen(20, 8) }), ID, AHORA);
    expect(a!.nivel).toBe('ALTO');
  });
  it('pide los ultimos 7 dias', async () => {
    const f = fuentes();
    await evaluar(ag, f, ID, AHORA);
    expect(f.resumenCitas).toHaveBeenCalledWith(ID, dia(7), dia(0), 'ESTADO');
  });
});

describe('agente inasistencias', () => {
  const ag = { id: 'inasistencias' as const, umbral: 0.5 };
  it('agrupa las de riesgo alto y no incluye datos personales', async () => {
    const f = fuentes({ riesgoProximasCitas: async () => [riesgo(1, 0.9), riesgo(2, 0.6), riesgo(3, 0.2)] });
    const [a] = await evaluar(ag, f, ID, AHORA);
    expect(a).toMatchObject({ clave: 'inasistencias', nivel: 'MEDIO', datos: { total: 2 } });
    expect(a!.titulo).toBe('2 citas con riesgo alto de inasistencia');
    expect(JSON.stringify(a)).not.toMatch(/paciente/i);
    expect((a!.datos.citas as unknown[])[0]).toMatchObject({ citaId: 'c1', probabilidad: 0.9 });
  });
  it('ALTO desde 5 citas; nada si ninguna supera el umbral', async () => {
    const muchas = Array.from({ length: 6 }, (_, i) => riesgo(i, 0.8));
    expect((await evaluar(ag, fuentes({ riesgoProximasCitas: async () => muchas }), ID, AHORA))[0]!.nivel).toBe('ALTO');
    expect(await evaluar(ag, fuentes({ riesgoProximasCitas: async () => [riesgo(1, 0.1)] }), ID, AHORA)).toEqual([]);
    expect((await evaluar(ag, fuentes({ riesgoProximasCitas: async () => [riesgo(1, 0.7)] }), ID, AHORA))[0]!.titulo).toBe('1 cita con riesgo alto de inasistencia');
  });
});

describe('agente demanda', () => {
  const ag = { id: 'demanda' as const, umbral: 1.5 };
  const esp = (especialidad: string, citasPorSemana: number) => ({ especialidad, segmento: 0, etiqueta: 'Demanda alta', citasPorSemana, citasTotal: citasPorSemana * 10 });
  const con = (e: ReturnType<typeof esp>[]) => fuentes({ demanda: async () => ({ k: 2, silueta: 0.5, fuente: 'x', sintetico: false, segmentos: [], especialidades: e }) });
  it('marca las especialidades muy por encima del promedio, una alerta por especialidad', async () => {
    const r = await evaluar(ag, con([esp('pediatria', 40), esp('cardiologia', 5), esp('dermatologia', 5), esp('medicina_general', 6)]), ID, AHORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ clave: 'demanda:pediatria', nivel: 'MEDIO', titulo: 'Demanda alta en pediatria' });
  });
  it('sin datos suficientes o sin sobresalientes no alerta', async () => {
    expect(await evaluar(ag, con([esp('a', 10)]), ID, AHORA)).toEqual([]);
    expect(await evaluar(ag, con([esp('a', 10), esp('b', 11), esp('c', 9)]), ID, AHORA)).toEqual([]);
  });
});

describe('agente ingresos', () => {
  const ag = { id: 'ingresos' as const, umbral: 0.2 };
  const fila = (d: number, confirmado: number): IngresoPeriodo => ({ periodo: dia(d), confirmado, provisional: 0, facturas: 1 });
  const serie = (previo: number, actual: number) => [...[13, 12, 11, 10, 9, 8, 7].map((d) => fila(d, previo / 7)), ...[6, 5, 4, 3, 2, 1, 0].map((d) => fila(d, actual / 7))];
  it('alerta cuando los ultimos 7 dias caen frente a los 7 previos', async () => {
    const [m] = await evaluar(ag, fuentes({ ingresos: async () => serie(700, 500) }), ID, AHORA);
    expect(m).toMatchObject({ clave: 'ingresos', nivel: 'MEDIO', datos: { actual: 500, previo: 700 } });
    expect((await evaluar(ag, fuentes({ ingresos: async () => serie(700, 350) }), ID, AHORA))[0]!.nivel).toBe('ALTO');
  });
  it('no alerta con caida menor, con subida o sin base previa', async () => {
    expect(await evaluar(ag, fuentes({ ingresos: async () => serie(700, 600) }), ID, AHORA)).toEqual([]);
    expect(await evaluar(ag, fuentes({ ingresos: async () => serie(700, 900) }), ID, AHORA)).toEqual([]);
    expect(await evaluar(ag, fuentes({ ingresos: async () => [fila(0, 100)] }), ID, AHORA)).toEqual([]);
  });
});
