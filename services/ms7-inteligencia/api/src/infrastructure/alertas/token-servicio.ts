import { Logger } from '@nestjs/common';
import type { TokenServicioPort } from '../../application/alertas/ports.js';
import type { Identidad } from '../../domain/gestion.js';

/**
 * Identidad de servicio para los agentes programados: client credentials de Keycloak (cliente `MS7_CLIENT_ID` con cuenta de
 * servicio y rol administrador). Sin credenciales el planificador queda apagado; los agentes siguen disponibles bajo demanda
 * con el token de quien los ejecuta. El secreto vive solo en el entorno.
 */
export class TokenServicio implements TokenServicioPort {
  private readonly log = new Logger('TokenServicio');
  private cache?: { token: string; expira: number };
  private avisado = false;

  constructor(
    private readonly o = {
      clientId: process.env.MS7_CLIENT_ID ?? '',
      clientSecret: process.env.MS7_CLIENT_SECRET ?? '',
      tokenUrl: process.env.KEYCLOAK_TOKEN_URL ?? `${process.env.KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/sigec'}/protocol/openid-connect/token`,
    },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly ahora: () => number = Date.now,
  ) {}

  async identidad(): Promise<Identidad | null> {
    if (!this.o.clientId || !this.o.clientSecret) {
      if (!this.avisado) {
        this.avisado = true;
        this.log.warn('MS7_CLIENT_ID/MS7_CLIENT_SECRET sin definir: los agentes programados estan apagados (se pueden ejecutar a mano)');
      }
      return null;
    }
    if (!this.cache || this.cache.expira - 30_000 <= this.ahora()) {
      try {
        const res = await this.fetchFn(this.o.tokenUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.o.clientId, client_secret: this.o.clientSecret }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Keycloak respondio ${res.status}`);
        const j = (await res.json()) as { access_token: string; expires_in: number };
        this.cache = { token: j.access_token, expira: this.ahora() + j.expires_in * 1000 };
      } catch (e) {
        this.log.warn(`no se pudo obtener el token de servicio: ${(e as Error).message}`);
        return null;
      }
    }
    return { token: this.cache.token, roles: ['administrador'], usuario: `servicio:${this.o.clientId}` };
  }
}
