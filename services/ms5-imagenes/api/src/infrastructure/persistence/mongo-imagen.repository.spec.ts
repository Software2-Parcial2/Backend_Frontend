import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { Imagen } from '../../domain/imagen.js';
import { CursorInvalidoError, MongoImagenRepository } from './mongo-imagen.repository.js';

// Integracion contra MongoDB (docker compose up -d). Se omite si no responde.
const uri = (process.env.MONGO_URL ?? 'mongodb://localhost:27017/sigec_imagenes').replace(/\/[^/]*$/, `/test_imagenes_${randomUUID().slice(0, 8)}`);
const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 1500 });
const available = await conn.asPromise().then(() => true).catch(() => false);

const nueva = (pacienteId: string, creadaEn: number, over: Partial<Imagen> = {}): Imagen => ({
  id: randomUUID(), pacienteId, estudio: 'x', estado: 'SUBIDA', hashSha256: 'a'.repeat(64), mime: 'image/png', bytes: 5, bucket: 'b', objectKey: `k/${randomUUID()}`, usuarioId: 'u', origen: 'MEDICO', validacion: 'PENDIENTE', intentosAnalisis: 0, creadaEn, actualizadaEn: creadaEn, ...over,
});

// El validador $jsonSchema real (scripts/mongo-init): todas las pruebas del repositorio corren con el activo, asi que un
// cambio del modelo que el validador rechace rompe aqui y no en produccion.
const { aplicar } = (await import('../../../../../../scripts/mongo-init/index.mjs' as string)) as { aplicar: (db: unknown) => Promise<string[]> };

describe.skipIf(!available)('MongoImagenRepository (MongoDB)', () => {
  const repo = new MongoImagenRepository(conn);
  beforeAll(async () => {
    await aplicar(conn.db);
    await repo.guardar(nueva('00000000-0000-4000-8000-000000000000', 1)); // fuerza la coleccion/indices de Mongoose
  });
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
      const r = await repo.buscar({ pacienteId: p }, 2, cursor);
      vistos.push(...r.items.map((x) => x.id));
      expect(r.items.every((x) => x.pacienteId === p)).toBe(true);
      if (!r.siguiente) break;
      cursor = r.siguiente;
    }
    expect(vistos).toHaveLength(5);
    expect(new Set(vistos).size).toBe(5);
    expect(new Set(vistos)).toEqual(new Set(ids));
    await expect(repo.buscar({ pacienteId: p }, 2, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
  });

  it('las transiciones son condicionales: la segunda no cambia nada (idempotente)', async () => {
    const i = nueva(randomUUID(), 1);
    await repo.guardar(i);
    const r = { probabilidad_neumonia: 0.2, clase: 'NORMAL' as const, version_modelo: 'v', modelo: 'stub-no-clinico', aviso: 'a' };
    expect(await repo.transicion(i.id, ['SUBIDA', 'ANALIZANDO'], { estado: 'ANALIZADA', resultado: r }, 10)).toBe(true);
    expect(await repo.transicion(i.id, ['SUBIDA', 'ANALIZANDO'], { estado: 'FALLIDA', error: 'x' }, 11)).toBe(false);
    expect(await repo.obtener(i.id)).toMatchObject({ estado: 'ANALIZADA', resultado: { probabilidad_neumonia: 0.2 }, actualizadaEn: 10 });
  });

  it('busca por validacion y texto libre, encuentra duplicados por huella y registra la validacion una sola vez', async () => {
    const p = randomUUID();
    const hash = 'b'.repeat(64);
    const i = nueva(p, 7000, { hashSha256: hash, pacienteNombre: 'Carla Rojas', numeroHistoria: 'HC-004218', estado: 'ANALIZADA' });
    await repo.guardar(i);
    await repo.guardar(nueva(p, 7001, { pacienteNombre: 'Otra Persona', validacion: 'VALIDADO' }));
    expect((await repo.buscar({ validacion: 'PENDIENTE', q: 'rojas' }, 10)).items.map((x) => x.id)).toEqual([i.id]);
    expect((await repo.buscar({ q: 'hc-0042' }, 10)).items.map((x) => x.id)).toContain(i.id);
    expect((await repo.buscar({ q: '.*' }, 10)).items).toHaveLength(0); // el texto no se interpreta como expresion regular
    expect((await repo.porHash(p, hash))?.id).toBe(i.id);
    expect(await repo.porHash(randomUUID(), hash)).toBeNull();
    const informe = { decision: 'CONFIRMA' as const, texto: null, validadoPor: 'dr', medicoId: null, validadoEn: 9, huella: 'c'.repeat(64), versionModelo: 'v' };
    expect(await repo.validar(i.id, informe, 'VALIDADO', 9)).toBe(true);
    expect(await repo.validar(i.id, informe, 'DESCARTADO', 10)).toBe(false);
    expect((await repo.conEventoPendiente(10)).map((x) => x.id)).toContain(i.id);
    await repo.marcarEventoPublicado(i.id);
    expect((await repo.conEventoPendiente(10)).map((x) => x.id)).not.toContain(i.id);
    expect(await repo.obtener(i.id)).toMatchObject({ validacion: 'VALIDADO', informe: { huella: 'c'.repeat(64) } });
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

  describe('validador $jsonSchema del servidor (scripts/mongo-init)', () => {
    const col = () => conn.db!.collection('imagenes');
    const valido = () => {
      const { id, ...resto } = nueva(randomUUID(), 10);
      return { _id: id, ...resto } as Record<string, unknown>;
    };

    it('acepta lo que escribe el repositorio, incluido el resultado del analisis', async () => {
      const i = nueva(randomUUID(), 20);
      await repo.guardar(i);
      await repo.transicion(i.id, ['SUBIDA'], { estado: 'ANALIZADA', resultado: { probabilidad_neumonia: 0.4, clase: 'NORMAL', version_modelo: 'v1', modelo: 'stub-no-clinico', aviso: 'x' } }, 30);
      expect((await repo.obtener(i.id))?.estado).toBe('ANALIZADA');
    });

    it.each([
      ['estado fuera del catalogo', { estado: 'BORRADA' }],
      ['mime no permitido', { mime: 'application/pdf' }],
      ['hash que no es SHA-256 en hexadecimal', { hashSha256: 'zz' }],
      ['tamano negativo', { bytes: -1 }],
      ['campo desconocido', { extra: 1 }],
      ['probabilidad fuera de 0..1', { resultado: { probabilidad_neumonia: 1.5, clase: 'NORMAL', modelo: 'm' } }],
      ['clase invalida', { resultado: { probabilidad_neumonia: 0.5, clase: 'OTRA', modelo: 'm' } }],
    ])('rechaza %s', async (_nombre, cambio) => {
      await expect(col().insertOne({ ...valido(), ...cambio } as never)).rejects.toMatchObject({ code: 121 });
    });

    it('rechaza un documento sin campos obligatorios', async () => {
      const { pacienteId: _omitido, ...sin } = valido();
      await expect(col().insertOne(sin as never)).rejects.toMatchObject({ code: 121 });
    });

    it('la clave de S3 es unica', async () => {
      const a = valido();
      await col().insertOne(a as never);
      await expect(col().insertOne({ ...valido(), objectKey: a.objectKey } as never)).rejects.toMatchObject({ code: 11000 });
    });
  });
});
