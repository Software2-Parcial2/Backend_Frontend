import { codificarCursor, decodificarCursor } from '@sigec/http-nest';
import type pg from 'pg';
import type { AlertasRepository, AsistenciaRepository } from '../../application/alertas/ports.js';
import type { Agente, AgenteId, Alerta, CandidataAlerta, FiltroAlertas, PaginaAlertas } from '../../application/alertas/tipos.js';

export class CursorInvalidoError extends Error {}

type Db = Pick<pg.Pool, 'query'>;

const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

const aAgente = (r: Record<string, unknown>): Agente => ({
  id: r.id as AgenteId,
  nombre: r.nombre as string,
  descripcion: r.descripcion as string,
  activo: r.activo as boolean,
  intervaloMin: r.intervalo_min as number,
  umbral: Number(r.umbral),
  ultimaEjecucion: iso(r.ultima_ejecucion as Date | null),
  ultimoEstado: (r.ultimo_estado as 'OK' | 'ERROR' | null) ?? null,
  ultimoError: (r.ultimo_error as string | null) ?? null,
  ultimasAlertas: r.ultimas_alertas as number,
});

const aAlerta = (r: Record<string, unknown>): Alerta => ({
  id: r.id as string,
  agenteId: r.agente_id as AgenteId,
  clave: r.clave as string,
  nivel: r.nivel as Alerta['nivel'],
  estado: r.estado as Alerta['estado'],
  titulo: r.titulo as string,
  detalle: r.detalle as string,
  datos: (r.datos as Record<string, unknown> | null) ?? null,
  creadaEn: iso(r.creada_en as Date)!,
  actualizadaEn: iso(r.actualizada_en as Date)!,
  atendidaEn: iso(r.atendida_en as Date | null),
  atendidaPor: (r.atendida_por as string | null) ?? null,
  nota: (r.nota as string | null) ?? null,
});

export class PgAlertasRepository implements AlertasRepository {
  constructor(private readonly db: () => Db) {}

  async listarAgentes(): Promise<Agente[]> {
    return (await this.db().query('SELECT * FROM agentes_monitoreo ORDER BY id')).rows.map(aAgente);
  }

  async obtenerAgente(id: AgenteId): Promise<Agente | null> {
    const r = await this.db().query('SELECT * FROM agentes_monitoreo WHERE id = $1', [id]);
    return r.rows[0] ? aAgente(r.rows[0]) : null;
  }

  async actualizarAgente(id: AgenteId, c: Partial<Pick<Agente, 'activo' | 'intervaloMin' | 'umbral'>>): Promise<Agente | null> {
    const r = await this.db().query(
      'UPDATE agentes_monitoreo SET activo = COALESCE($2, activo), intervalo_min = COALESCE($3, intervalo_min), umbral = COALESCE($4, umbral) WHERE id = $1 RETURNING *',
      [id, c.activo ?? null, c.intervaloMin ?? null, c.umbral ?? null],
    );
    return r.rows[0] ? aAgente(r.rows[0]) : null;
  }

  async registrarEjecucion(id: AgenteId, ahora: Date, estado: 'OK' | 'ERROR', error: string | null, alertas: number): Promise<void> {
    await this.db().query('UPDATE agentes_monitoreo SET ultima_ejecucion = $2, ultimo_estado = $3, ultimo_error = $4, ultimas_alertas = $5 WHERE id = $1', [id, ahora, estado, error, alertas]);
  }

  async guardarCandidata(agenteId: AgenteId, c: CandidataAlerta): Promise<{ alerta: Alerta; nueva: boolean }> {
    // Refresca la abierta con esa clave; si no hay, inserta. La carrera entre dos ejecuciones la resuelve el indice unico parcial.
    const upd = await this.db().query(
      `UPDATE alertas SET nivel = $2, titulo = $3, detalle = $4, datos = $5::jsonb, actualizada_en = now()
        WHERE clave = $1 AND estado = 'ABIERTA' RETURNING *`,
      [c.clave, c.nivel, c.titulo, c.detalle, JSON.stringify(c.datos)],
    );
    if (upd.rows[0]) return { alerta: aAlerta(upd.rows[0]), nueva: false };
    try {
      const ins = await this.db().query(
        'INSERT INTO alertas (agente_id, clave, nivel, titulo, detalle, datos) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *',
        [agenteId, c.clave, c.nivel, c.titulo, c.detalle, JSON.stringify(c.datos)],
      );
      return { alerta: aAlerta(ins.rows[0]), nueva: true };
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return this.guardarCandidata(agenteId, c); // otra ejecucion la creo antes: se refresca
      throw e;
    }
  }

  async listarAlertas(f: FiltroAlertas, limite: number, cursor?: string): Promise<PaginaAlertas> {
    const where: string[] = [];
    const args: unknown[] = [];
    const p = (v: unknown) => (args.push(v), `$${args.length}`);
    if (f.estado) where.push(`estado = ${p(f.estado)}`);
    if (f.nivel) where.push(`nivel = ${p(f.nivel)}`);
    if (f.agenteId) where.push(`agente_id = ${p(f.agenteId)}`);
    if (cursor) {
      const k = decodificarCursor<{ t: string; id: string }>(cursor);
      if (!k || typeof k.t !== 'string' || typeof k.id !== 'string' || Number.isNaN(Date.parse(k.t)) || !/^[0-9a-f-]{36}$/i.test(k.id)) throw new CursorInvalidoError('cursor invalido');
      where.push(`(creada_en, id) < (${p(k.t)}::timestamptz, ${p(k.id)}::uuid)`);
    }
    const r = await this.db().query(`SELECT * FROM alertas ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY creada_en DESC, id DESC LIMIT ${p(limite + 1)}`, args);
    const items = r.rows.slice(0, limite).map(aAlerta);
    const ultimo = items.at(-1);
    return { items, siguiente: r.rows.length > limite && ultimo ? codificarCursor({ t: ultimo.creadaEn, id: ultimo.id }) : null };
  }

  async obtenerAlerta(id: string): Promise<Alerta | null> {
    const r = await this.db().query('SELECT * FROM alertas WHERE id = $1', [id]);
    return r.rows[0] ? aAlerta(r.rows[0]) : null;
  }

  async atender(id: string, usuario: string, nota: string | null, ahora: Date): Promise<{ alerta: Alerta; ya: boolean } | null> {
    const r = await this.db().query(
      `UPDATE alertas SET estado = 'ATENDIDA', atendida_en = $2, atendida_por = $3, nota = $4, actualizada_en = $2
        WHERE id = $1 AND estado = 'ABIERTA' RETURNING *`,
      [id, ahora, usuario, nota],
    );
    if (r.rows[0]) return { alerta: aAlerta(r.rows[0]), ya: false };
    const actual = await this.obtenerAlerta(id);
    return actual ? { alerta: actual, ya: true } : null;
  }
}

export class PgAsistenciaRepository implements AsistenciaRepository {
  constructor(private readonly db: () => Db) {}

  async registrar(a: Parameters<AsistenciaRepository['registrar']>[0]): Promise<void> {
    // El estado final manda: una cita puede pasar de LLEGO a ATENDIDA; la reentrega del mismo evento no cambia nada.
    await this.db().query(
      `INSERT INTO asistencias (cita_id, paciente_id, medico_id, fecha_hora, asistencia) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (cita_id) DO UPDATE SET asistencia = EXCLUDED.asistencia, registrada_en = now()`,
      [a.citaId, a.pacienteId, a.medicoId, a.fechaHora, a.asistencia],
    );
  }

  async inasistenciasPrevias(pacienteIds: string[]): Promise<Map<string, number>> {
    if (pacienteIds.length === 0) return new Map();
    const r = await this.db().query(
      `SELECT paciente_id, count(*)::int AS n FROM asistencias WHERE asistencia = 'NO_ASISTIO' AND paciente_id = ANY($1::uuid[]) GROUP BY paciente_id`,
      [pacienteIds],
    );
    return new Map(r.rows.map((x: { paciente_id: string; n: number }) => [x.paciente_id, x.n]));
  }
}
