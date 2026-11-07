import { Logger } from '@nestjs/common';
import type { AvisoAlertasPort } from '../../application/alertas/ports.js';

/** Alerta interna por el workflow `alerta-interna` de n8n (mismo webhook que usa MS8). Un fallo solo se registra. */
export class AvisoN8n implements AvisoAlertasPort {
  private readonly log = new Logger('AvisoAlertas');

  constructor(
    private readonly baseUrl = process.env.N8N_BASE_URL ?? 'http://localhost:5678',
    private readonly secret = process.env.N8N_WEBHOOK_SECRET ?? '',
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async avisar(texto: string): Promise<void> {
    try {
      const res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}/webhook/alerta-interna`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sigec-secret': this.secret },
        body: JSON.stringify({ texto: `[SIGEC] ${texto}`.slice(0, 1000) }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.log.warn(`n8n respondio ${res.status} al avisar: ${texto}`);
    } catch (e) {
      this.log.warn(`no se pudo avisar por n8n (${(e as Error).message}): ${texto}`);
    }
  }
}

/** Sin aviso externo (pruebas o AVISO_ALERTAS=off): solo deja huella en el log. */
export class AvisoLog implements AvisoAlertasPort {
  private readonly log = new Logger('AvisoAlertas');
  async avisar(texto: string): Promise<void> {
    this.log.warn(`[ALERTA] ${texto}`);
  }
}
