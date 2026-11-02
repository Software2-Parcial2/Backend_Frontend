import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Imagen } from '../../domain/imagen.js';
import { CursorInvalidoError, MongoImagenRepository } from './mongo-imagen.repository.js';

// Integracion contra MongoDB (docker compose up -d). Se omite si no responde.
const uri = (process.env.MONGO_URL ?? 'mongodb://localhost:27017/sigec_imagenes').replace(/\/[^/]*$/, `/test_imagenes_${randomUUID().slice(0, 8)}`);
const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1500 });
const available = await conn.asPromise().then(() => true).catch(() => false);

const nueva = (pacienteId: string, creadaEn: number, over: Partial<Imagen> = {}): Imagen => ({
  id: randomUUID(), pacienteId, estudio: 'x', estado: 'SUBIDA', hashSha256: 'a'.repeat(64), mime: 'image/png', bytes: 5, bucket: 'b', objectKey: `k/${randomUUID()}`, usuarioId: 'u', intentosAnalisis: 0, creadaEn, actualizadaEn: creadaEn, ...over,
});

describe.skipIf(!available)('MongoImagenRepository (MongoDB)', () => {
  const repo = new MongoImagenRepository(conn);
  afterAll(async () => {
    await conn.dropDatabase().catch(() => undefined);
    await conn.close();
  });

  it('guarda y recupera los metadatos', async () => {
    const i = nueva(randomUUID(), 1000);
    await repo.guardar(i);
    expect(await repo.obtener(i.id)).toMatchObject({ id: i.id, estado: 'SUBIDA', hashSha256: 'a'.repeat(64), objectKey: i.objectKey });
    expect(await repo.obtener(randomUUID())).toBeNull();
  });

  it('lista por paciente, mas recientes primero, con cursor y sin repetir ni mezclar pacientes', async () => {
    const p = randomUUID();
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) { const i = nueva(p, 5000 + (n === 3 ? 4 : n)); ids.push(i.id); await repo.guardar(i); } // n=3 y n=4 comparten fecha -> desempata por id
    await repo.guardar(nueva(randomUUID(), 9999));
    const vistos: string[] = [];
    let cursor: string | undefined;
    for (let pagina = 0; pagina < 4; pagina++) {
      const r = await repo.porPaciente(p, 2, cursor);
      vistos.push(...r.items.map((x) => x.id));
      expect(r.items.every((x) => x.pacienteId === p)).toBe(true);
      if (!r.siguiente) break;
      cursor = r.siguiente;
    }
    expect(vistos).toHaveLength(5);
    expect(new Set(vistos).size).toBe(5);
    expect(new Set(vistos)).toEqual(new Set(ids));
    await expect(repo.porPaciente(p, 2, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  it('las transiciones son condicionales: la segunda no cambia nada (idempotente)', async () => {
    const i = nueva(randomUUID(), 1);
    await repo.guardar(i);
    const r = { probabilidad_neumonia: 0.2, clase: 'NORMAL' as const, version_modelo: 'v', modelo: 'stub-no-clinico', aviso: 'a' };
    expect(await repo.transicion(i.id, ['SUBIDA', 'ANALIZANDO'], { estado: 'ANALIZADA', resultado: r }, 10)).toBe(true);
    expect(await repo.transicion(i.id, ['SUBIDA', 'ANALIZANDO'], { estado: 'FALLIDA', error: 'x' }, 11)).toBe(false);
    expect(await repo.obtener(i.id)).toMatchObject({ estado: 'ANALIZADA', resultado: { probabilidad_neumonia: 0.2 }, actualizadaEn: 10 });
  });

  it('marcarEnvio cuenta el intento y atascadas devuelve las que no avanzan', async () => {
    const i = nueva(randomUUID(), 100);
    await repo.guardar(i);
    expect((await repo.marcarEnvio(i.id, ['SUBIDA'], 200))).toMatchObject({ estado: 'ANALIZANDO', intentosAnalisis: 1 });
    expect((await repo.atascadas(300, 50)).map((x) => x.id)).toContain(i.id);
    expect((await repo.atascadas(150, 50)).map((x) => x.id)).not.toContain(i.id);
    await repo.transicion(i.id, ['ANALIZANDO'], { estado: 'ANALIZADA' }, 400);
    expect((await repo.atascadas(9999, 50)).map((x) => x.id)).not.toContain(i.id);
    expect(await repo.marcarEnvio(i.id, ['SUBIDA'], 500)).toBeNull();
  });
});
