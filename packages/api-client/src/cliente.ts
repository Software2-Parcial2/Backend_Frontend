import { ApiError, esAbortado, type Problema } from './errores.js';
import { nuevoUuid } from './idempotencia.js';

type Valor = string | number | boolean | null | undefined;

/** Pagina de una lista con cursor (docs/api.md): `siguiente` es null cuando no hay mas. */
export interface Pagina<T> {
  items: T[];
  siguiente: string | null;
}

export interface OpcionesCliente {
  /** Base del gateway, p. ej. http://localhost:8090 (sin barra final). */
  baseUrl: string | (() => string);
  /** Token vigente. Se lee en CADA peticion: nunca se copia, asi el que renueva el shell siempre se usa. */
  token: () => string | undefined | Promise<string | undefined>;
  /**
   * Se llama ante un 401. Si renueva la sesion (o el token cambio), la peticion se repite UNA vez; si no, el error sube.
   * Devuelve true si hay un token nuevo con el que reintentar.
   */
  alNoAutenticado?: () => boolean | void | Promise<boolean | void>;
  /** Para pruebas o plataformas sin fetch global. */
  fetch?: typeof fetch;
  /** `Accept-Language` (por defecto es). */
  idioma?: string;
  /** Generador de ids de correlacion (por defecto UUID). */
  generarId?: () => string;
  /** Observador (telemetria / depuracion): se llama al terminar cada peticion. */
  alTerminar?: (info: { metodo: string; ruta: string; estado: number; ms: number; correlationId: string }) => void;
}

export interface OpcionesPeticion {
  query?: Record<string, Valor | Valor[]>;
  /** `Idempotency-Key`: pasar la MISMA en cada reintento del mismo envio. `false` la omite (rutas que no la exigen). */
  clave?: string | false;
  /** `If-Match`: una version, o `'auto'` para usar el ETag del ultimo GET de esa misma ruta. */
  ifMatch?: string | number | 'auto';
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** Respuesta con sus metadatos (ETag, Location...). */
export interface Respuesta<T> {
  datos: T;
  estado: number;
  /** Version para `If-Match` (el ETag sin comillas), si el servidor la envio. */
  etag: string | null;
  ubicacion: string | null;
  correlationId: string;
  /** true si es la respuesta guardada de un reintento (`Idempotent-Replay`). */
  repetida: boolean;
}

export interface Descarga {
  blob: Blob;
  nombre: string | null;
  tipo: string;
}

export interface ClienteApi {
  get<T>(ruta: string, op?: OpcionesPeticion): Promise<T>;
  post<T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion): Promise<T>;
  put<T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion): Promise<T>;
  patch<T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion): Promise<T>;
  delete<T = void>(ruta: string, op?: OpcionesPeticion): Promise<T>;
  /** Igual que get/post/put... pero devuelve tambien ETag, Location y el estado. */
  leer<T>(ruta: string, op?: OpcionesPeticion): Promise<Respuesta<T>>;
  enviar<T>(metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE', ruta: string, cuerpo?: unknown, op?: OpcionesPeticion): Promise<Respuesta<T>>;
  /** multipart/form-data (el navegador pone el boundary). */
  subir<T>(ruta: string, formulario: FormData, op?: OpcionesPeticion): Promise<Respuesta<T>>;
  /** Descarga un archivo (comprobantes, reportes). */
  descargar(ruta: string, op?: OpcionesPeticion & { metodo?: 'GET' | 'POST'; cuerpo?: unknown }): Promise<Descarga>;
  /** Una pagina de una lista con cursor. */
  pagina<T>(ruta: string, op?: OpcionesPeticion & { limite?: number; cursor?: string | null }): Promise<Pagina<T>>;
  /** Todas las paginas (con tope). `truncado` avisa si se corto. */
  todas<T>(ruta: string, op?: OpcionesPeticion & { limite?: number; maximo?: number }): Promise<{ items: T[]; truncado: boolean }>;
  /** Ultima version conocida (ETag) de una ruta leida con GET. */
  etagDe(ruta: string): string | undefined;
}

const METODOS_CON_CLAVE = new Set(['POST', 'PUT', 'PATCH']);

function aQuery(q: OpcionesPeticion['query']): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined && x !== null && x !== '') p.append(k, String(x));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

const sinComillas = (e: string | null): string | null => (e ? e.replace(/^W\//, '').replace(/"/g, '') : null);

async function leerProblema(res: Response): Promise<{ problema?: Problema; texto?: string }> {
  const tipo = res.headers.get('content-type') ?? '';
  let texto = '';
  try {
    texto = await res.text();
  } catch {
    return {};
  }
  if (!texto) return {};
  if (tipo.includes('json')) {
    try {
      const j = JSON.parse(texto) as Problema & { message?: string | string[] };
      // Servicios antiguos o errores de plataforma: {message} en vez de problem+json.
      if (!j.detail && j.message) j.detail = Array.isArray(j.message) ? j.message.join('; ') : j.message;
      return { problema: j };
    } catch {
      /* no era JSON valido */
    }
  }
  return { texto: texto.slice(0, 300) };
}

export function crearCliente(o: OpcionesCliente): ClienteApi {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const etags = new Map<string, string>();
  const base = () => (typeof o.baseUrl === 'function' ? o.baseUrl() : o.baseUrl).replace(/\/+$/, '');
  const claveEtag = (ruta: string) => ruta.split('?')[0]!;

  async function ejecutar(metodo: string, ruta: string, cuerpo: unknown, op: OpcionesPeticion = {}, esFormulario = false, reintentando = false): Promise<Response & { _cid: string }> {
    const cid = (o.generarId ?? nuevoUuid)();
    const cab: Record<string, string> = { Accept: 'application/json, application/problem+json;q=0.9, */*;q=0.5', 'Accept-Language': o.idioma ?? 'es', 'X-Correlation-Id': cid, ...op.headers };
    const token = await o.token();
    if (token) cab.Authorization = `Bearer ${token}`;
    if (METODOS_CON_CLAVE.has(metodo) && op.clave !== false) cab['Idempotency-Key'] = op.clave ?? nuevoUuid();
    if (op.ifMatch !== undefined) {
      const v = op.ifMatch === 'auto' ? etags.get(claveEtag(ruta)) : String(op.ifMatch);
      if (v !== undefined) cab['If-Match'] = `"${v}"`;
    }
    let body: BodyInit | undefined;
    if (esFormulario) body = cuerpo as FormData;
    else if (cuerpo !== undefined) {
      cab['Content-Type'] = 'application/json';
      body = JSON.stringify(cuerpo);
    }
    const t0 = Date.now();
    let res: Response;
    try {
      res = await f(`${base()}${ruta}${aQuery(op.query)}`, { method: metodo, headers: cab, body, signal: op.signal });
    } catch (e) {
      if (esAbortado(e) || (e instanceof Error && e.name === 'AbortError')) throw e;
      o.alTerminar?.({ metodo, ruta, estado: 0, ms: Date.now() - t0, correlationId: cid });
      throw new ApiError(0, undefined, 'No hay conexion con el servidor. Revisa tu red e intenta de nuevo.', cid);
    }
    o.alTerminar?.({ metodo, ruta, estado: res.status, ms: Date.now() - t0, correlationId: cid });

    if (res.status === 401 && !reintentando && o.alNoAutenticado) {
      const renovado = await o.alNoAutenticado();
      if (renovado !== false) return ejecutar(metodo, ruta, cuerpo, op, esFormulario, true);
    }
    // Lectura con Retry-After (429/503): una espera corta y un solo reintento.
    if ((res.status === 429 || res.status === 503) && metodo === 'GET' && !reintentando) {
      const ra = Number(res.headers.get('retry-after'));
      if (Number.isFinite(ra) && ra > 0 && ra <= 3) {
        await new Promise((r) => setTimeout(r, ra * 1000));
        return ejecutar(metodo, ruta, cuerpo, op, esFormulario, true);
      }
    }
    if (!res.ok) {
      const { problema, texto } = await leerProblema(res);
      throw new ApiError(res.status, problema, texto, cid);
    }
    return Object.assign(res, { _cid: cid });
  }

  async function aRespuesta<T>(res: Response & { _cid: string }, ruta: string, metodo: string): Promise<Respuesta<T>> {
    const etag = sinComillas(res.headers.get('etag'));
    if (etag !== null && metodo !== 'DELETE') etags.set(claveEtag(ruta), etag);
    let datos: unknown;
    if (res.status === 204 || res.status === 205) datos = undefined;
    else if ((res.headers.get('content-type') ?? '').includes('json')) datos = await res.json();
    else datos = await res.text();
    return {
      datos: datos as T,
      estado: res.status,
      etag,
      ubicacion: res.headers.get('location'),
      correlationId: res.headers.get('x-correlation-id') ?? res._cid,
      repetida: res.headers.get('idempotent-replay') === 'true',
    };
  }

  const leer = async <T>(ruta: string, op?: OpcionesPeticion) => aRespuesta<T>(await ejecutar('GET', ruta, undefined, op), ruta, 'GET');
  const enviar = async <T>(metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE', ruta: string, cuerpo?: unknown, op?: OpcionesPeticion) =>
    aRespuesta<T>(await ejecutar(metodo, ruta, cuerpo, op), ruta, metodo);

  const pagina = async <T>(ruta: string, op: OpcionesPeticion & { limite?: number; cursor?: string | null } = {}): Promise<Pagina<T>> => {
    const { limite, cursor, ...resto } = op;
    const r = await leer<Pagina<T>>(ruta, { ...resto, query: { ...resto.query, limite, cursor } });
    return { items: r.datos?.items ?? [], siguiente: r.datos?.siguiente ?? null };
  };

  return {
    get: async <T>(ruta: string, op?: OpcionesPeticion) => (await leer<T>(ruta, op)).datos,
    post: async <T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion) => (await enviar<T>('POST', ruta, cuerpo, op)).datos,
    put: async <T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion) => (await enviar<T>('PUT', ruta, cuerpo, op)).datos,
    patch: async <T>(ruta: string, cuerpo?: unknown, op?: OpcionesPeticion) => (await enviar<T>('PATCH', ruta, cuerpo, op)).datos,
    delete: async <T = void>(ruta: string, op?: OpcionesPeticion) => (await enviar<T>('DELETE', ruta, undefined, op)).datos,
    leer,
    enviar,
    subir: async <T>(ruta: string, formulario: FormData, op?: OpcionesPeticion) => aRespuesta<T>(await ejecutar('POST', ruta, formulario, op, true), ruta, 'POST'),
    descargar: async (ruta, op = {}) => {
      const metodo = op.metodo ?? 'GET';
      const res = await ejecutar(metodo, ruta, op.cuerpo, op);
      const cd = res.headers.get('content-disposition') ?? '';
      const nombre = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1] ?? null;
      return { blob: await res.blob(), nombre: nombre ? decodeURIComponent(nombre) : null, tipo: res.headers.get('content-type') ?? 'application/octet-stream' };
    },
    pagina,
    todas: async <T>(ruta: string, op: OpcionesPeticion & { limite?: number; maximo?: number } = {}) => {
      const { maximo = 1000, limite = 100, ...resto } = op;
      const items: T[] = [];
      let cursor: string | null = null;
      for (;;) {
        const p: Pagina<T> = await pagina<T>(ruta, { ...resto, limite, cursor });
        items.push(...p.items);
        if (!p.siguiente) return { items, truncado: false };
        if (items.length >= maximo) return { items: items.slice(0, maximo), truncado: true };
        cursor = p.siguiente;
      }
    },
    etagDe: (ruta) => etags.get(claveEtag(ruta)),
  };
}
