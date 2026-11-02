/**
 * Prueba de RECUPERACION real del RAG: PostgreSQL con pgvector + servicio de embeddings + docs/rag.
 * Solo corre con RAG_IT=1 (necesita MS7_DATABASE_URL y EMBEDDINGS_URL):
 *   docker run -d --name pgv -e POSTGRES_PASSWORD=tmp -e POSTGRES_DB=ms7_inteligencia -p 127.0.0.1:5498:5432 pgvector/pgvector:pg17
 *   scripts/dev-services.sh start ms7-embeddings
 *   RAG_IT=1 MS7_DATABASE_URL=postgres://postgres:tmp@127.0.0.1:5498/ms7_inteligencia pnpm --filter ms7-api exec vitest run test/rag.recuperacion.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RagService } from '../src/application/rag/rag.service.js';
import { DocumentosEnDisco } from '../src/infrastructure/rag/docs-fs.js';
import { EmbeddingsHttpClient } from '../src/infrastructure/rag/embeddings.client.js';
import { migrar } from '../src/infrastructure/rag/migraciones.js';
import { cerrarPool, pool_ } from '../src/infrastructure/rag/pg.js';
import { PgRagRepository } from '../src/infrastructure/rag/pg-rag.repository.js';

// pregunta -> [documento (titulo), seccion] que DEBE aparecer entre los 3 primeros resultados
const ESPERADAS: [string, string, string][] = [
  ['¿Cuánto tiempo antes puedo cancelar mi cita sin pagar nada?', 'Política de cancelación y reprogramación de citas', 'Cancelación por el paciente'],
  ['¿Cuántas veces puedo reprogramar una cita sin costo?', 'Política de cancelación y reprogramación de citas', 'Reprogramación'],
  ['¿Me devuelven el dinero si la clínica cancela mi cita?', 'Política de cancelación y reprogramación de citas', 'Cancelación por parte de la clínica'],
  ['¿Cuánto cuesta una consulta de pediatría?', 'Aranceles y descuentos', 'Consultas'],
  ['¿Hay descuento para los adultos mayores?', 'Aranceles y descuentos', 'Descuentos'],
  ['¿Qué formas de pago aceptan?', 'Aranceles y descuentos', 'Formas de pago'],
  ['¿A qué hora toman las muestras en el laboratorio?', 'Horarios de atención', 'Laboratorio e imagenología'],
  ['¿Qué pasa si llego 20 minutos tarde a mi cita?', 'Protocolo de atención al paciente', 'Llegadas tardías'],
  ['¿A quién se deriva a urgencias de inmediato?', 'Protocolo de atención al paciente', 'Triaje'],
  ['¿Cuántos años guardan la historia clínica?', 'Protección de datos personales y de salud', 'Conservación y seguridad'],
  ['¿Quién puede ver mis datos de salud?', 'Protección de datos personales y de salud', 'Quién puede acceder'],
];
// Limitaciones conocidas del modelo pequeno (384 dim): consultas muy cortas o indirectas sobre un detalle dentro de una seccion larga.
// `it.fails` documenta el fallo actual y avisara cuando un modelo mejor lo corrija.
const LIMITACIONES: [string, string, string][] = [
  ['¿Atienden los domingos?', 'Horarios de atención', 'Consulta externa'],
  ['Horario de atención los domingos', 'Horarios de atención', 'Consulta externa'],
];
const FUERA_DE_ALCANCE = ['¿Cuál es la capital de Francia?', 'Receta de pastel de chocolate con nueces', 'Cómo programar un videojuego en Unity'];

describe.skipIf(!process.env.RAG_IT)('RAG: recuperacion con pgvector y embeddings reales', () => {
  let rag: RagService;
  const umbral = Number(process.env.RAG_SCORE_MINIMO ?? 0.3);

  beforeAll(async () => {
    await migrar(pool_());
    rag = new RagService(new EmbeddingsHttpClient(), new PgRagRepository(), new DocumentosEnDisco(), { chunkChars: 480, solape: 80, scoreMinimo: umbral });
    await rag.reindexar(true);
  }, 180_000);
  afterAll(async () => cerrarPool());

  it('las migraciones son idempotentes y el indice HNSW existe', async () => {
    expect(await migrar(pool_())).toEqual([]);
    const { rows } = await pool_().query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'rag_fragmentos_embedding_hnsw'`);
    expect(rows[0].indexdef).toMatch(/USING hnsw .*vector_cosine_ops/);
  });

  it('reindexar sin cambios no reprocesa nada; indexa los 5 documentos', async () => {
    const r = await rag.reindexar();
    expect(r.indexados).toEqual([]);
    expect(r.sinCambios).toHaveLength(5);
    expect((await rag.estado()).documentos).toBe(5);
  });

  it.each(ESPERADAS)('«%s» -> %s / %s', async (pregunta, documento, seccion) => {
    const top = await rag.buscar(pregunta, 3);
    const hit = top.findIndex((f) => f.documento === documento && f.seccion === seccion);
    expect(hit, `esperaba ${documento}/${seccion}; obtuvo ${top.map((f) => `${f.documento}/${f.seccion}@${f.puntuacion}`).join(' | ')}`).toBeGreaterThanOrEqual(0);
  });

  it.fails.each(LIMITACIONES)('LIMITACION CONOCIDA «%s» -> %s / %s', async (pregunta, documento, seccion) => {
    const top = await rag.buscar(pregunta, 3);
    expect(top.some((f) => f.documento === documento && f.seccion === seccion)).toBe(true);
  });

  it('al menos el 75 % de las preguntas acierta en el primer resultado', async () => {
    let primero = 0;
    for (const [q, d, s] of ESPERADAS) {
      const top = await rag.buscar(q, 1);
      if (top[0]?.documento === d && top[0]?.seccion === s) primero++;
    }
    expect(primero / ESPERADAS.length).toBeGreaterThanOrEqual(0.75); // medido: ver docs/inteligencia.md
  });

  it('las preguntas fuera de alcance quedan bajo el umbral (el agente dira que no hay informacion)', async () => {
    for (const q of FUERA_DE_ALCANCE) expect(await rag.buscar(q, 3), q).toEqual([]);
  });
});
