import * as SQLite from 'expo-sqlite';

/** SQLite local: `cache` (ultima lectura por usuario) y `cola` (solicitudes de cita pendientes, con su Idempotency-Key). */
let abierta: Promise<SQLite.SQLiteDatabase> | undefined;
export function db(): Promise<SQLite.SQLiteDatabase> {
  abierta ??= (async () => {
    const d = await SQLite.openDatabaseAsync('sigec.db');
    await d.execAsync(`
      CREATE TABLE IF NOT EXISTS cache (clave TEXT PRIMARY KEY NOT NULL, valor TEXT NOT NULL, en INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cola (id TEXT PRIMARY KEY NOT NULL, clave TEXT NOT NULL, datos TEXT NOT NULL, creada INTEGER NOT NULL);
    `);
    return d;
  })();
  return abierta;
}
