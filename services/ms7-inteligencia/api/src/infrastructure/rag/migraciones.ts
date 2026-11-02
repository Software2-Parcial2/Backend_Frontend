import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const DIR = process.env.MS7_MIGRATIONS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../migrations');

/**
 * Migraciones versionadas (NNNN_nombre.sql). Cada una se aplica en una transaccion y se registra con su checksum en
 * `schema_migrations`; si un archivo ya aplicado cambia, se aborta (las migraciones aplicadas son inmutables).
 * Un bloqueo asesor evita que dos replicas migren a la vez.
 */
export async function migrar(pool: pg.Pool, dir = DIR): Promise<string[]> {
  const aplicadas: string[] = [];
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock(7070707)');
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, aplicada_en timestamptz NOT NULL DEFAULT now())`);
    const previas = new Map((await cliente.query<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migrations')).rows.map((r) => [r.version, r.checksum]));
    const archivos = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const f of archivos) {
      const sql = await readFile(join(dir, f), 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previa = previas.get(f);
      if (previa) {
        if (previa !== checksum) throw new Error(`La migracion ${f} ya fue aplicada y su contenido cambio (crea una migracion nueva)`);
        continue;
      }
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [f, checksum]);
        await cliente.query('COMMIT');
        aplicadas.push(f);
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock(7070707)').catch(() => undefined);
    cliente.release();
  }
  return aplicadas;
}
