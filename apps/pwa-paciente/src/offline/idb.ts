/** Envoltorio minimo de IndexedDB (dos almacenes). Si el navegador no lo permite, usa memoria y la app sigue funcionando en linea. */
const NOMBRE = 'sigec-paciente'
type Almacen = 'cola' | 'cache'
const LLAVES: Record<Almacen, string> = { cola: 'id', cache: 'clave' }
const memoria: Record<Almacen, Map<string, unknown>> = { cola: new Map(), cache: new Map() }

let abierta: Promise<IDBDatabase | null> | undefined
function abrir(): Promise<IDBDatabase | null> {
  abierta ??= new Promise((ok) => {
    try {
      const r = indexedDB.open(NOMBRE, 1)
      r.onupgradeneeded = () => {
        for (const a of Object.keys(LLAVES) as Almacen[]) r.result.createObjectStore(a, { keyPath: LLAVES[a] })
      }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => ok(null)
    } catch {
      ok(null)
    }
  })
  return abierta
}

function pedir<T>(db: IDBDatabase, a: Almacen, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((ok, no) => {
    const r = f(db.transaction(a, modo).objectStore(a))
    r.onsuccess = () => ok(r.result as T)
    r.onerror = () => no(r.error)
  })
}

export async function leer<T>(a: Almacen, llave: string): Promise<T | undefined> {
  const db = await abrir()
  return db ? ((await pedir<T | undefined>(db, a, 'readonly', (s) => s.get(llave))) ?? undefined) : (memoria[a].get(llave) as T | undefined)
}
export async function guardar<T extends object>(a: Almacen, valor: T): Promise<void> {
  const db = await abrir()
  if (db) await pedir(db, a, 'readwrite', (s) => s.put(valor))
  else memoria[a].set(String((valor as Record<string, unknown>)[LLAVES[a]]), valor)
}
export async function borrar(a: Almacen, llave: string): Promise<void> {
  const db = await abrir()
  if (db) await pedir(db, a, 'readwrite', (s) => s.delete(llave))
  else memoria[a].delete(llave)
}
export async function todos<T>(a: Almacen): Promise<T[]> {
  const db = await abrir()
  return db ? pedir<T[]>(db, a, 'readonly', (s) => s.getAll()) : ([...memoria[a].values()] as T[])
}
