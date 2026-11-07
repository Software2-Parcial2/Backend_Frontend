import type { Sonda, SondaPort } from '../application/ports.js';

/** Sonda por HTTP: cualquier 2xx es OK. Nunca lanza. */
export class SondaHttp implements SondaPort {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async comprobar(s: Sonda, timeoutMs: number) {
    const t0 = Date.now();
    try {
      const res = await this.fetchFn(s.url, { signal: AbortSignal.timeout(timeoutMs) });
      return { ok: res.ok, ms: Date.now() - t0, detalle: res.ok ? null : `HTTP ${res.status}` };
    } catch (e) {
      const nombre = (e as Error).name;
      return { ok: false, ms: Date.now() - t0, detalle: nombre === 'TimeoutError' || nombre === 'AbortError' ? 'sin respuesta a tiempo' : 'no responde' };
    }
  }
}

/** Componentes de la pila y su comprobacion. Se pueden sobrescribir con SALUD_SERVICIOS (JSON [{nombre,url}]). */
export function sondasPorDefecto(env: NodeJS.ProcessEnv = process.env): Sonda[] {
  if (env.SALUD_SERVICIOS) {
    const j = JSON.parse(env.SALUD_SERVICIOS) as Sonda[];
    if (!Array.isArray(j) || j.some((s) => !s?.nombre || !s?.url)) throw new Error('SALUD_SERVICIOS debe ser un arreglo de {nombre,url}');
    return j;
  }
  const kc = (env.KEYCLOAK_URL ?? 'http://localhost:8080').replace(/\/$/, '');
  return [
    { nombre: 'gateway', url: `${env.GATEWAY_URL ?? 'http://localhost:8090'}/actuator/health` },
    { nombre: 'keycloak', url: `${kc}/realms/${env.KEYCLOAK_REALM ?? 'sigec'}/.well-known/openid-configuration` },
    { nombre: 'ms2-pacientes', url: `${env.MS2_URL ?? 'http://localhost:8082'}/actuator/health` },
    { nombre: 'ms3-citas', url: `${env.MS3_URL ?? 'http://localhost:3003'}/health` },
    { nombre: 'ms4-historias', url: `${env.MS4_URL ?? 'http://localhost:8084'}/actuator/health` },
    { nombre: 'ms5-imagenes', url: `${env.MS5_URL ?? 'http://localhost:3005'}/health` },
    { nombre: 'ms6-facturacion', url: `${env.MS6_URL ?? 'http://localhost:8006'}/api/facturacion/health` },
    { nombre: 'ms7-inteligencia', url: `${env.MS7_URL ?? 'http://localhost:3007'}/health` },
    { nombre: 'ms8-notificaciones', url: `${env.MS8_URL ?? 'http://localhost:3008'}/health` },
  ];
}
