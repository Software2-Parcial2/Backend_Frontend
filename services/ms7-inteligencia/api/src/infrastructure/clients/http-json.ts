import { AccesoDenegadoError, ServicioNoDisponibleError } from '../../domain/gestion.js';

export interface OpcionesHttp {
  servicio: string;
  baseUrl: string;
  timeoutMs: number;
}

/** GET JSON con timeout. Traduce 401/403 a AccesoDenegadoError y el resto de fallos a ServicioNoDisponibleError. */
export async function getJson<T>(o: OpcionesHttp, ruta: string, params: Record<string, string | number | undefined>, cabeceras: Record<string, string>): Promise<T> {
  const url = new URL(o.baseUrl.replace(/\/$/, '') + ruta);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  return pedir<T>(o, url, { method: 'GET', headers: cabeceras });
}

export async function postJson<T>(o: OpcionesHttp, ruta: string, cuerpo: unknown, cabeceras: Record<string, string>): Promise<T> {
  const url = new URL(o.baseUrl.replace(/\/$/, '') + ruta);
  return pedir<T>(o, url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo) });
}

async function pedir<T>(o: OpcionesHttp, url: URL, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(o.timeoutMs) });
  } catch (e) {
    throw new ServicioNoDisponibleError(o.servicio, e instanceof Error ? e.message : String(e));
  }
  if (res.status === 401 || res.status === 403) throw new AccesoDenegadoError(`${o.servicio} rechazo el acceso (${res.status})`);
  if (!res.ok) throw new ServicioNoDisponibleError(o.servicio, `HTTP ${res.status}`);
  return (await res.json()) as T;
}
