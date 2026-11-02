import { Injectable } from '@nestjs/common';
import pgvector from 'pgvector';
import type { FragmentoPolitica } from '../../application/agente/ports.js';
import type { DocumentoIndexado, RagRepositorio } from '../../application/rag/ports.js';
import { pool_ } from './pg.js';

@Injectable()
export class PgRagRepository implements RagRepositorio {
  async documentos(): Promise<DocumentoIndexado[]> {
    return (await pool_().query<DocumentoIndexado>('SELECT ruta, hash, version, modelo FROM rag_documentos')).rows;
  }

  async guardar(doc: { ruta: string; titulo: string; version: string; hash: string; modelo: string }, fragmentos: { seccion: string; orden: number; texto: string; embedding: number[] }[]) {
    const c = await pool_().connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO rag_documentos (ruta, titulo, version, hash, modelo) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (ruta) DO UPDATE SET titulo = EXCLUDED.titulo, version = EXCLUDED.version, hash = EXCLUDED.hash, modelo = EXCLUDED.modelo, indexado_en = now()
         RETURNING id`,
        [doc.ruta, doc.titulo, doc.version, doc.hash, doc.modelo],
      );
      const id = rows[0]!.id;
      await c.query('DELETE FROM rag_fragmentos WHERE documento_id = $1', [id]);
      for (const f of fragmentos) {
        await c.query('INSERT INTO rag_fragmentos (documento_id, seccion, orden, texto, embedding) VALUES ($1,$2,$3,$4,$5)', [id, f.seccion, f.orden, f.texto, pgvector.toSql(f.embedding)]);
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  async eliminar(rutas: string[]) {
    await pool_().query('DELETE FROM rag_documentos WHERE ruta = ANY($1)', [rutas]);
  }

  async buscar(embedding: number[], k: number): Promise<FragmentoPolitica[]> {
    const { rows } = await pool_().query<{ documento: string; seccion: string; version: string; texto: string; puntuacion: number }>(
      `SELECT d.titulo AS documento, f.seccion, d.version, f.texto, 1 - (f.embedding <=> $1) AS puntuacion
         FROM rag_fragmentos f JOIN rag_documentos d ON d.id = f.documento_id
        ORDER BY f.embedding <=> $1 LIMIT $2`,
      [pgvector.toSql(embedding), k],
    );
    return rows.map((r) => ({ ...r, puntuacion: Number(r.puntuacion) }));
  }

  async estadisticas() {
    const { rows } = await pool_().query<{ documentos: string; fragmentos: string }>(
      `SELECT (SELECT count(*) FROM rag_documentos) AS documentos, (SELECT count(*) FROM rag_fragmentos) AS fragmentos`,
    );
    return { documentos: Number(rows[0]!.documentos), fragmentos: Number(rows[0]!.fragmentos) };
  }
}
