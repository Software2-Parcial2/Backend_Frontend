import { describe, expect, it, vi } from 'vitest';
import type { Identidad } from '../../domain/gestion.js';
import { GestionService } from '../gestion.service.js';
import { AlertasService } from './alertas.service.js';
import type { AlertasRepository } from './ports.js';
import { AgenteInvalidoError, AlertaNoEncontradaError, AlertaYaAtendidaError, type Agente, type Alerta, type CandidataAlerta } from './tipos.js';

const ID: Identidad = { token: 't', roles: ['administrador'], usuario: 'a' };
const AHORA = Date.parse('2026-06-15T12:00:00Z');

function repoEnMemoria(): AlertasRepository & { alertas: Alerta[]; agentes: Map<string, Agente> } {
  const agentes = new Map<string, Agente>(
    (['cancelaciones', 'inasistencias', 'demanda', 'ingresos'] as const).map((id) => [id, { id, nombre: id, descripcion: '', activo: true, intervaloMin: 60, umbral: 0.25, ultimaEjecucion: null, ultimoEstado: null, ultimoError: null, ultimasAlertas: 0 }]),
  );
  const alertas: Alerta[] = [];
  let n = 0;
  return {
    alertas,
    agentes,
    listarAgentes: async () => [...agentes.values()],
    obtenerAgente: async (id) => agentes.get(id) ?? null,
    actualizarAgente: async (id, c) => (agentes.has(id) ? Object.assign(agentes.get(id)!, Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))) : null),
    registrarEjecucion: async (id, ahora, estado, error, k) => void Object.assign(agentes.get(id)!, { ultimaEjecucion: ahora.toISOString(), ultimoEstado: estado, ultimoError: error, ultimasAlertas: k }),
    guardarCandidata: async (agenteId, c: CandidataAlerta) => {
      const abierta = alertas.find((a) => a.clave === c.clave && a.estado === 'ABIERTA');
      if (abierta) return { alerta: Object.assign(abierta, c), nueva: false };
      const a: Alerta = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, agenteId, ...c, estado: 'ABIERTA', creadaEn: new Date(AHORA + n).toISOString(), actualizadaEn: '', atendidaEn: null, atendidaPor: null, nota: null };
      alertas.push(a);
      return { alerta: a, nueva: true };
    },
    listarAlertas: async (f) => ({ items: alertas.filter((a) => (!f.estado || a.estado === f.estado) && (!f.nivel || a.nivel === f.nivel)), siguiente: null }),
    obtenerAlerta: async (id) => alertas.find((a) => a.id === id) ?? null,
    atender: async (id, usuario, nota, ahora) => {
      const a = alertas.find((x) => x.id === id);
      if (!a) return null;
      if (a.estado === 'ATENDIDA') return { alerta: a, ya: true };
      Object.assign(a, { estado: 'ATENDIDA', atendidaEn: ahora.toISOString(), atendidaPor: usuario, nota });
      return { alerta: a, ya: false };
    },
  };
}

function montar(over: { identidad?: Identidad | null; cancelaciones?: { total: number; canceladas: number } } = {}) {
  const repo = repoEnMemoria();
  const avisos: string[] = [];
  const c = over.cancelaciones ?? { total: 20, canceladas: 10 };
  const gestion = {
    resumenCitas: vi.fn(async () => ({ desde: '', hasta: '', agrupadoPor: 'ESTADO', total: c.total, truncado: false, grupos: [{ clave: 'CANCELADA', total: c.canceladas, confirmadas: 0, canceladas: c.canceladas }] })),
    riesgoProximasCitas: vi.fn(async () => []),
    demanda: vi.fn(async () => { throw new Error('ML caido'); }),
    ingresos: vi.fn(async () => []),
  } as unknown as GestionService;
  const svc = new AlertasService(repo, { avisar: async (t) => void avisos.push(t) }, { identidad: async () => (over.identidad === undefined ? ID : over.identidad) }, gestion);
  svc.ahora = () => AHORA;
  return { svc, repo, avisos, gestion };
}

describe('AlertasService', () => {
  it('ejecutar crea la alerta, avisa una sola vez y refresca la abierta en la siguiente ejecucion', async () => {
    const t = montar();
    expect(await t.svc.ejecutar('cancelaciones', ID)).toEqual({ agenteId: 'cancelaciones', alertas: 1, nuevas: 1 });
    expect(t.avisos).toHaveLength(1);
    expect(t.avisos[0]).toMatch(/^ALTO: Cancelaciones altas/);
    expect(await t.svc.ejecutar('cancelaciones', ID)).toEqual({ agenteId: 'cancelaciones', alertas: 1, nuevas: 0 });
    expect(t.avisos).toHaveLength(1);
    expect(t.repo.alertas).toHaveLength(1);
    expect(t.repo.agentes.get('cancelaciones')).toMatchObject({ ultimoEstado: 'OK', ultimasAlertas: 1 });
  });

  it('una alerta atendida deja de bloquear: si la condicion persiste se crea otra', async () => {
    const t = montar();
    await t.svc.ejecutar('cancelaciones', ID);
    const a = t.repo.alertas[0]!;
    expect((await t.svc.atender(a.id, 'ana', ' ya llamamos ')).nota).toBe('ya llamamos');
    await expect(t.svc.atender(a.id, 'ana')).rejects.toBeInstanceOf(AlertaYaAtendidaError);
    await t.svc.ejecutar('cancelaciones', ID);
    expect(t.repo.alertas).toHaveLength(2);
    await expect(t.svc.atender('00000000-0000-4000-8000-ffffffffffff', 'ana')).rejects.toBeInstanceOf(AlertaNoEncontradaError);
  });

  it('un fallo del origen se anota en el agente y se propaga', async () => {
    const t = montar();
    await expect(t.svc.ejecutar('demanda', ID)).rejects.toThrow('ML caido');
    expect(t.repo.agentes.get('demanda')).toMatchObject({ ultimoEstado: 'ERROR', ultimoError: 'ML caido' });
  });

  it('valida el agente y los cambios de configuracion', async () => {
    const t = montar();
    await expect(t.svc.ejecutar('inventado', ID)).rejects.toBeInstanceOf(AgenteInvalidoError);
    await expect(t.svc.actualizarAgente('demanda', { intervaloMin: 2 })).rejects.toBeInstanceOf(AgenteInvalidoError);
    await expect(t.svc.actualizarAgente('demanda', { umbral: 0 })).rejects.toBeInstanceOf(AgenteInvalidoError);
    expect(await t.svc.actualizarAgente('demanda', { activo: false, umbral: 2 })).toMatchObject({ activo: false, umbral: 2 });
  });

  describe('planificador', () => {
    it('corre solo los agentes activos vencidos y respeta el intervalo', async () => {
      const t = montar();
      t.repo.agentes.get('demanda')!.activo = false;
      t.repo.agentes.get('inasistencias')!.activo = false;
      t.repo.agentes.get('ingresos')!.activo = false;
      const r1 = await t.svc.ejecutarVencidos();
      expect(r1.map((x) => x.agenteId)).toEqual(['cancelaciones']);
      expect(await t.svc.ejecutarVencidos()).toEqual([]); // aun no vence
      t.svc.ahora = () => AHORA + 61 * 60_000;
      expect((await t.svc.ejecutarVencidos()).map((x) => x.agenteId)).toEqual(['cancelaciones']);
    });

    it('sin identidad de servicio no corre nada; un agente que falla no frena a los demas', async () => {
      const sin = montar({ identidad: null });
      expect(await sin.svc.ejecutarVencidos()).toEqual([]);
      expect(sin.gestion.resumenCitas).not.toHaveBeenCalled();
      const t = montar();
      const r = await t.svc.ejecutarVencidos(); // demanda falla; ingresos/inasistencias/cancelaciones siguen
      expect(r.map((x) => x.agenteId).sort()).toEqual(['cancelaciones', 'inasistencias', 'ingresos']);
      expect(t.repo.agentes.get('demanda')!.ultimoEstado).toBe('ERROR');
    });
  });
});
