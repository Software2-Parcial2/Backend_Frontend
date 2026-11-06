#!/usr/bin/env node
// EXPLAIN de las 5 consultas principales de PostgreSQL contra las bases reales; escribe docs/datos/explain.md.
// Para cada una: plan natural (con pocas filas el planificador prefiere Seq Scan, y es correcto) y plan con
// enable_seqscan=off (demuestra que el indice previsto existe y sirve). Las dos de MS6 se miden ademas con 50.000 facturas
// insertadas dentro de una transaccion que se DESHACE (no deja datos). Solo desarrollo local.
import { writeFile } from 'node:fs/promises';
import pg from 'pg';

try { process.loadEnvFile(new URL('../../.env', import.meta.url)); } catch { /* sin .env */ }
const env = (k, d) => process.env[k] ?? d;
if (!/(localhost|127\.0\.0\.1)/.test(env('POSTGRES_HOST', 'localhost'))) throw new Error('Solo desarrollo local');
const conectar = async (database) => {
  const c = new pg.Client({ host: env('POSTGRES_HOST', 'localhost'), port: Number(env('POSTGRES_PORT', env('POSTGRES_HOST_PORT', '5432'))), user: env('POSTGRES_USER', 'sigec'), password: env('POSTGRES_PASSWORD', ''), database });
  await c.connect();
  return c;
};
const plan = async (c, sql, params = []) => (await c.query(`EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF, TIMING OFF, SUMMARY OFF) ${sql}`, params)).rows.map((r) => r['QUERY PLAN']).join('\n');
const usa = (p, indice) => (p.includes(indice) ? 'SI' : 'NO');

const consultas = [];

// 1 y 2: MS6
{
  const c = await conectar('ms6_facturacion');
  const paciente = (await c.query('SELECT paciente_id FROM facturas GROUP BY 1 ORDER BY count(*) DESC LIMIT 1')).rows[0]?.paciente_id ?? '00000000-0000-4000-8000-000000000000';
  const q1 = 'SELECT * FROM facturas WHERE paciente_id = $1 ORDER BY created_at DESC LIMIT 100';
  const q2 = `SELECT date_trunc('month', created_at) AS periodo, sum(monto) FROM facturas WHERE created_at BETWEEN $1 AND $2 AND estado IN ('CONFIRMADA','PROVISIONAL') GROUP BY 1 ORDER BY 1`;
  const p2 = ['2026-10-01', '2026-10-31']; // ventana de un mes, como el dashboard de MS7
  for (const [n, titulo, sql, params, indice, db] of [
    [1, 'MS6: facturas de un paciente, mas recientes primero (`GET /api/facturacion/facturas`, rol paciente)', q1, [paciente], 'facturas_paciente_fecha_idx', c],
    [2, 'MS6: ingresos por periodo (`GET /api/facturacion/facturas/ingresos`, MS7)', q2, p2, 'facturas_estado_fecha_idx', c],
  ]) {
    const natural = await plan(db, sql, params);
    await db.query('BEGIN');
    await db.query('SET LOCAL enable_seqscan = off');
    const forzado = await plan(db, sql, params);
    await db.query('ROLLBACK');
    await db.query('BEGIN');
    await db.query(`INSERT INTO facturas (id, cita_id, paciente_id, monto, estado, created_at, updated_at)
      SELECT gen_random_uuid(), gen_random_uuid(), ('00000000-0000-4000-8000-' || lpad((g % 500)::text, 12, '0'))::uuid, 100, (ARRAY['CONFIRMADA','PROVISIONAL','ANULADA'])[1 + g % 3], '2026-01-01'::timestamp + (g % 300) * interval '1 day', now()
      FROM generate_series(1, 50000) g`);
    await db.query('ANALYZE facturas');
    const masivo = await plan(db, sql, n === 1 ? ['00000000-0000-4000-8000-000000000007'] : params);
    await db.query('ROLLBACK');
    consultas.push({ n, titulo, sql, indice, natural, forzado, masivo });
  }
  await c.end();
}
// 3: MS4
{
  const c = await conectar('ms4_historias');
  const h = (await c.query('SELECT historia_id FROM consultas GROUP BY 1 ORDER BY count(*) DESC LIMIT 1')).rows[0]?.historia_id ?? '00000000-0000-4000-8000-000000000000';
  const sql = 'SELECT * FROM consultas WHERE historia_id = $1 ORDER BY fecha DESC LIMIT 20';
  const natural = await plan(c, sql, [h]);
  await c.query('BEGIN'); await c.query('SET LOCAL enable_seqscan = off');
  const forzado = await plan(c, sql, [h]);
  await c.query('ROLLBACK');
  consultas.push({ n: 3, titulo: 'MS4: ultimas consultas de una historia clinica', sql, indice: 'idx_consultas_historia', natural, forzado });
  await c.end();
}
// 4: MS7 (RAG)
{
  const c = await conectar('ms7_inteligencia');
  const v = (await c.query('SELECT embedding::text AS e FROM rag_fragmentos LIMIT 1')).rows[0]?.e;
  if (v) {
    const sql = 'SELECT id, seccion, 1 - (embedding <=> $1::vector) AS puntuacion FROM rag_fragmentos ORDER BY embedding <=> $1::vector LIMIT 4';
    const natural = await plan(c, sql, [v]);
    await c.query('BEGIN'); await c.query('SET LOCAL enable_seqscan = off');
    const forzado = await plan(c, sql, [v]);
    await c.query('ROLLBACK');
    consultas.push({ n: 4, titulo: 'MS7: busqueda semantica del RAG (vecinos mas cercanos por coseno)', sql, indice: 'rag_fragmentos_embedding_hnsw', natural, forzado });
  }
  await c.end();
}
// 5: MS2
{
  const c = await conectar('ms2_pacientes');
  const sql = `SELECT m.id, m.nombre FROM medicos m JOIN especialidades e ON e.id = m.especialidad_id WHERE e.codigo = $1 AND m.activo`;
  const natural = await plan(c, sql, ['cardiologia']);
  await c.query('BEGIN'); await c.query('SET LOCAL enable_seqscan = off');
  const forzado = await plan(c, sql, ['cardiologia']);
  await c.query('ROLLBACK');
  consultas.push({ n: 5, titulo: 'MS2: medicos activos de una especialidad (por codigo)', sql, indice: 'idx_medicos_especialidad', natural, forzado });
  await c.end();
}

let md = `# EXPLAIN de las consultas principales de PostgreSQL

Generado por \`node scripts/datos/explain.mjs\` (\`make datos-explain\`) contra las bases de desarrollo con la semilla cargada.
**Como leerlo:** con pocas filas, el planificador elige \`Seq Scan\` (es lo correcto: leer 20 paginas cuesta menos que bajar por un indice).
Por eso cada consulta se muestra tres veces: *natural*; *forzando indice* (\`enable_seqscan = off\`), que demuestra que el indice previsto existe y es aplicable;
y, para MS6, *con 50.000 facturas* (transaccion deshecha), donde el planificador lo elige solo.

| # | Consulta | Indice previsto | Aplicable (forzado) | Elegido solo con volumen |
|---|---|---|---|---|
${consultas.map((q) => `| ${q.n} | ${q.titulo.split(':')[0]}: ${q.titulo.split(': ')[1].split(' (')[0]} | \`${q.indice}\` | ${usa(q.forzado, q.indice)} | ${q.masivo ? usa(q.masivo, q.indice) : 'n/a (tabla pequena)'} |`).join('\n')}

`;
for (const q of consultas) {
  md += `## ${q.n}. ${q.titulo}\n\n\`\`\`sql\n${q.sql}\n\`\`\`\n\n**Plan natural**\n\n\`\`\`\n${q.natural}\n\`\`\`\n\n**Forzando indice**\n\n\`\`\`\n${q.forzado}\n\`\`\`\n\n`;
  if (q.masivo) md += `**Con 50.000 filas**\n\n\`\`\`\n${q.masivo}\n\`\`\`\n\n`;
}
await writeFile(new URL('../../docs/datos/explain.md', import.meta.url), md);
console.log(consultas.map((q) => `#${q.n} ${q.indice}: forzado=${usa(q.forzado, q.indice)} masivo=${q.masivo ? usa(q.masivo, q.indice) : '-'}`).join('\n'));
