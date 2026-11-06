#!/usr/bin/env node
// Crea (de forma repetible) las colecciones de MongoDB con su validador $jsonSchema e indices.
// Uso: make mongo-init   |   MONGO_URL=mongodb://localhost:27017/sigec_imagenes node scripts/mongo-init/index.mjs
import { MongoClient } from 'mongodb';
import { COLECCIONES } from './esquema.mjs';

/** Aplica el esquema sobre `db`. Idempotente: puede ejecutarse cuantas veces haga falta. Devuelve un resumen por coleccion. */
export async function aplicar(db) {
  const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const resumen = [];
  for (const c of COLECCIONES) {
    const opciones = { validator: c.validator, validationLevel: 'strict', validationAction: 'error' };
    let accion = 'creada';
    if (!existentes.has(c.name)) {
      try {
        await db.createCollection(c.name, opciones);
      } catch (e) {
        if (e?.code !== 48) throw e; // NamespaceExists: otro proceso (p. ej. Mongoose de MS5) la creo en paralelo
        accion = null;
      }
    } else accion = null;
    if (accion === null) {
      await db.command({ collMod: c.name, ...opciones });
      accion = 'validador actualizado';
    }
    const col = db.collection(c.name);
    const indices = new Set((await col.indexes()).map((i) => i.name));
    for (const nombre of c.dropIndexes ?? []) {
      if (indices.has(nombre)) {
        await col.dropIndex(nombre);
        accion += `; indice ${nombre} eliminado`;
      }
    }
    for (const { name, key, ...rest } of c.indexes) {
      if (!indices.has(name)) accion += `; indice ${name} creado`;
      await col.createIndex(key, { name, ...rest });
    }
    resumen.push(`${c.name.padEnd(12)} ${accion}`);
  }
  return resumen;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // .env del repo: loadEnvFile NO pisa las variables ya definidas (permite MONGO_URL=... make mongo-init con otro puerto).
  try {
    process.loadEnvFile(new URL('../../.env', import.meta.url));
  } catch {
    /* sin .env: se usan los valores por defecto */
  }
  const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017/sigec_imagenes';
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    for (const l of await aplicar(client.db())) console.log(l);
  } finally {
    await client.close();
  }
}
