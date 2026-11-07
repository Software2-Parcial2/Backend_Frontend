import type { CitaConRiesgo, DemandaEspecialidades, Identidad, IngresoPeriodo, ResumenCitas } from '../../domain/gestion.js';
import type { Agente, CandidataAlerta, NivelAlerta } from './tipos.js';

const DIA = 86_400_000;
/** Con menos citas la tasa no significa nada. */
export const MIN_CITAS_CANCELACION = 8;

/** Lo que los agentes leen (lo implementa GestionService; asi comparten reglas de acceso y limites con GraphQL y MCP). */
export interface Fuentes {
  resumenCitas(id: Identidad, desde: string, hasta: string, por: 'ESTADO'): Promise<ResumenCitas>;
  riesgoProximasCitas(id: Identidad, dias: number, limite: number): Promise<CitaConRiesgo[]>;
  demanda(): Promise<DemandaEspecialidades>;
  ingresos(id: Identidad, desde: string, hasta: string, agrupar: 'dia'): Promise<IngresoPeriodo[]>;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Cada agente es una funcion pura de lo que lee y de su umbral: facil de probar y de razonar. */
export async function evaluar(agente: Pick<Agente, 'id' | 'umbral'>, f: Fuentes, id: Identidad, ahora: number): Promise<CandidataAlerta[]> {
  switch (agente.id) {
    case 'cancelaciones': return cancelaciones(agente.umbral, f, id, ahora);
    case 'inasistencias': return inasistencias(agente.umbral, f, id);
    case 'demanda': return demanda(agente.umbral, f);
    case 'ingresos': return ingresos(agente.umbral, f, id, ahora);
  }
}

async function cancelaciones(umbral: number, f: Fuentes, id: Identidad, ahora: number): Promise<CandidataAlerta[]> {
  const r = await f.resumenCitas(id, dia(ahora - 7 * DIA), dia(ahora), 'ESTADO');
  const canceladas = r.grupos.reduce((s, g) => s + g.canceladas, 0);
  if (r.total < MIN_CITAS_CANCELACION) return [];
  const tasa = canceladas / r.total;
  if (tasa < umbral) return [];
  const nivel: NivelAlerta = tasa >= umbral * 1.5 ? 'ALTO' : 'MEDIO';
  return [
    {
      clave: 'cancelaciones',
      nivel,
      titulo: `Cancelaciones altas: ${pct(tasa)} en 7 dias`,
      detalle: `${canceladas} de ${r.total} citas de los ultimos 7 dias se cancelaron (umbral ${pct(umbral)}).`,
      datos: { canceladas, total: r.total, tasa: Math.round(tasa * 1000) / 1000, umbral, desde: dia(ahora - 7 * DIA), hasta: dia(ahora), parcial: r.truncado },
    },
  ];
}

async function inasistencias(umbral: number, f: Fuentes, id: Identidad): Promise<CandidataAlerta[]> {
  const citas = await f.riesgoProximasCitas(id, 3, 200);
  const altas = citas.filter((c) => c.riesgo && c.riesgo.probabilidad >= umbral).sort((a, b) => b.riesgo!.probabilidad - a.riesgo!.probabilidad);
  if (altas.length === 0) return [];
  return [
    {
      clave: 'inasistencias',
      nivel: altas.length >= 5 ? 'ALTO' : 'MEDIO',
      titulo: `${altas.length} cita${altas.length === 1 ? '' : 's'} con riesgo alto de inasistencia`,
      detalle: `En los proximos 3 dias hay ${altas.length} cita(s) con probabilidad de inasistencia de ${pct(umbral)} o mas. Conviene reforzar el recordatorio.`,
      datos: {
        total: altas.length,
        umbral,
        sintetico: altas[0]!.riesgo!.sintetico,
        // Solo ids y probabilidad: nada clinico ni nombres.
        citas: altas.slice(0, 10).map((c) => ({ citaId: c.citaId, fechaHora: c.fechaHora, probabilidad: Math.round(c.riesgo!.probabilidad * 1000) / 1000 })),
      },
    },
  ];
}

async function demanda(umbral: number, f: Fuentes): Promise<CandidataAlerta[]> {
  const d = await f.demanda();
  const con = d.especialidades.filter((e) => e.citasPorSemana > 0);
  if (con.length < 2) return [];
  const promedio = con.reduce((s, e) => s + e.citasPorSemana, 0) / con.length;
  return con
    .filter((e) => e.citasPorSemana >= promedio * umbral)
    .map((e) => ({
      clave: `demanda:${e.especialidad}`,
      nivel: (e.citasPorSemana >= promedio * umbral * 1.5 ? 'MEDIO' : 'BAJO') as NivelAlerta,
      titulo: `Demanda alta en ${e.especialidad.replace(/_/g, ' ')}`,
      detalle: `${e.especialidad.replace(/_/g, ' ')} tiene ${Math.round(e.citasPorSemana * 10) / 10} citas por semana, ${Math.round((e.citasPorSemana / promedio) * 10) / 10} veces el promedio (${Math.round(promedio * 10) / 10}).`,
      datos: { especialidad: e.especialidad, citasPorSemana: e.citasPorSemana, promedio: Math.round(promedio * 100) / 100, segmento: e.etiqueta, sintetico: d.sintetico },
    }));
}

async function ingresos(umbral: number, f: Fuentes, id: Identidad, ahora: number): Promise<CandidataAlerta[]> {
  const filas = await f.ingresos(id, dia(ahora - 14 * DIA + DIA), dia(ahora), 'dia');
  const limite = dia(ahora - 7 * DIA);
  const suma = (xs: IngresoPeriodo[]) => xs.reduce((s, x) => s + x.confirmado, 0);
  const actual = suma(filas.filter((x) => x.periodo > limite));
  const previo = suma(filas.filter((x) => x.periodo <= limite));
  if (previo <= 0) return [];
  const caida = (previo - actual) / previo;
  if (caida < umbral) return [];
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    {
      clave: 'ingresos',
      nivel: caida >= umbral * 2 ? 'ALTO' : 'MEDIO',
      titulo: `Ingresos a la baja: -${pct(caida)} en 7 dias`,
      detalle: `Los ingresos confirmados de los ultimos 7 dias (${r(actual)} BOB) cayeron ${pct(caida)} frente a los 7 anteriores (${r(previo)} BOB).`,
      datos: { actual: r(actual), previo: r(previo), caida: Math.round(caida * 1000) / 1000, umbral, moneda: 'BOB' },
    },
  ];
}
