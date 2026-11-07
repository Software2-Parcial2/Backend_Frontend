/**
 * Repositorios de alertas y asistencia contra PostgreSQL real (base temporal con solo la migracion 0003).
 * Se omite si no hay PostgreSQL (docker compose up -d postgres). Usa POSTGRES_* del entorno o del .env de la raiz.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgAlertasRepository, PgAsistenciaRepository, CursorInvalidoError } from '../src/infrastructure/alertas/pg-alertas.repository.js';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../../../.env'));
} catch {
  /* sin .env */
}
const cfg = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_HOST_PORT ?? process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'sigec',
  password: process.env.POSTGRES_PASSWORD ?? '',
};
const nombre = `ms7_test_${randomUUID().slice(0, 8)}`;
const admin = new pg.Pool({ ...cfg, database: 'postgres', max: 1, connectionTimeoutMillis: 1500 });
const disponible = await admin.query(`CREATE DATABASE ${nombre}`).then(() => true).catch(() => false);

describe.skipIf(!disponible)('alertas y asistencia (PostgreSQL)', () => {
  let pool: pg.Pool;
  let alertas: PgAlertasRepository;
  let asistencia: PgAsistenciaRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ ...cfg, database: nombre, max: 4 });
    await pool.query(await readFile(resolve(import.meta.dirname, '../migrations/0003_alertas_agentes_asistencias.sql'), 'utf-8'));
    alertas = new PgAlertasRepository(() => pool);
    asistencia = new PgAsistenciaRepository(() => pool);
  });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${nombre}`).catch(() => undefined);
    await admin.end();
  });

  const cand = (clave: string, nivel: 'BAJO' | 'MEDIO' | 'ALTO' = 'MEDIO') => ({ clave, nivel, titulo: `t ${clave}`, detalle: 'd', datos: { n: 1 } });

  it('la migracion siembra los cuatro agentes con su configuracion', async () => {
    const a = await alertas.listarAgentes();
    expect(a.map((x) => x.id)).toEqual(['cancelaciones', 'demanda', 'inasistencias', 'ingresos']);
    expect(a.find((x) => x.id === 'inasistencias')).toMatchObject({ activo: true, intervaloMin: 60, umbral: 0.5, ultimaEjecucion: null });
    expect(await alertas.actualizarAgente('demanda', { activo: false, umbral: 2 })).toMatchObject({ activo: false, umbral: 2, intervaloMin: 240 });
    await alertas.registrarEjecucion('demanda', new Date('2026-06-01T00:00:00Z'), 'ERROR', 'ML caido', 0);
    expect(await alertas.obtenerAgente('demanda')).toMatchObject({ ultimoEstado: 'ERROR', ultimoError: 'ML caido', ultimaEjecucion: '2026-06-01T00:00:00.000Z' });
    await expect(pool.query("UPDATE agentes_monitoreo SET intervalo_min = 1 WHERE id = 'demanda'")).rejects.toThrow();
  });

  it('una sola alerta abierta por clave: se refresca, y tras atenderla se crea otra', async () => {
    const a = await alertas.guardarCandidata('cancelaciones', cand('c1', 'MEDIO'));
    expect(a.nueva).toBe(true);
    const b = await alertas.guardarCandidata('cancelaciones', cand('c1', 'ALTO'));
    expect(b.nueva).toBe(false);
    expect(b.alerta).toMatchObject({ id: a.alerta.id, nivel: 'ALTO', estado: 'ABIERTA' });
    const at = await alertas.atender(a.alerta.id, 'ana', 'ok', new Date());
    expect(at).toMatchObject({ ya: false, alerta: { estado: 'ATENDIDA', atendidaPor: 'ana', nota: 'ok' } });
    expect((await alertas.atender(a.alerta.id, 'luis', null, new Date()))!.ya).toBe(true);
    expect(await alertas.atender(randomUUID(), 'x', null, new Date())).toBeNull();
    const c = await alertas.guardarCandidata('cancelaciones', cand('c1'));
    expect(c.nueva).toBe(true);
    expect(c.alerta.id).not.toBe(a.alerta.id);
  });

  it('dos ejecuciones simultaneas con la misma clave dejan una sola alerta abierta', async () => {
    const r = await Promise.all(Array.from({ length: 6 }, () => alertas.guardarCandidata('ingresos', cand('carrera'))));
    expect(r.filter((x) => x.nueva)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM alertas WHERE clave = 'carrera' AND estado = 'ABIERTA'")).rows[0].n).toBe(1);
  });

  it('lista con filtros y cursor sin repetir ni saltar', async () => {
    for (let i = 0; i < 5; i++) await alertas.guardarCandidata('demanda', cand(`lista:${i}`, i % 2 ? 'ALTO' : 'BAJO'));
    const vistos: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const p = await alertas.listarAlertas({ estado: 'ABIERTA', agenteId: 'demanda' }, 2, cursor);
      vistos.push(...p.items.map((x) => x.id));
      if (!p.siguiente) break;
      cursor = p.siguiente;
    }
    expect(vistos).toHaveLength(5);
    expect(new Set(vistos).size).toBe(5);
    expect((await alertas.listarAlertas({ nivel: 'ALTO', agenteId: 'demanda' }, 10)).items).toHaveLength(2);
    await expect(alertas.listarAlertas({}, 2, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  it('asistencia: upsert por cita (la reentrega no duplica) y cuenta solo las inasistencias', async () => {
    const p1 = randomUUID();
    const p2 = randomUUID();
    const reg = (citaId: string, pacienteId: string, a: 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO') => asistencia.registrar({ citaId, pacienteId, medicoId: null, fechaHora: '2026-06-01T10:00:00Z', asistencia: a });
    const [c1, c2, c3] = [randomUUID(), randomUUID(), randomUUID()];
    await reg(c1, p1, 'NO_ASISTIO');
    await reg(c1, p1, 'NO_ASISTIO'); // reentrega
    await reg(c2, p1, 'NO_ASISTIO');
    await reg(c3, p2, 'LLEGO');
    await reg(c3, p2, 'ATENDIDA'); // LLEGO -> ATENDIDA
    const m = await asistencia.inasistenciasPrevias([p1, p2, randomUUID()]);
    expect(m.get(p1)).toBe(2);
    expect(m.has(p2)).toBe(false);
    expect((await pool.query('SELECT asistencia FROM asistencias WHERE cita_id = $1', [c3])).rows[0].asistencia).toBe('ATENDIDA');
    expect(await asistencia.inasistenciasPrevias([])).toEqual(new Map());
  });
});
