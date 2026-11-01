import type { Canal } from '../../domain/notificacion.js';
import type { AlertaPort, NotificationSender } from '../../application/ports.js';
import type { Mensaje } from '../../application/plantillas.js';

export interface N8nOptions {
  /** Base de n8n, p. ej. http://localhost:5678 */
  baseUrl: string;
  /** Secreto compartido (cabecera X-Sigec-Secret) que valida el webhook de n8n. */
  secret: string;
  timeoutMs?: number;
  /** Reintentos inmediatos ante error de red, timeout o 5xx (ademas del backoff de la notificacion). */
  reintentos?: number;
  esperaMs?: number;
  fetchFn?: typeof fetch;
}

class FalloN8n extends Error {
  constructor(
    msg: string,
    readonly reintentable: boolean,
  ) {
    super(msg);
  }
}

async function postWebhook(o: N8nOptions, path: string, body: unknown): Promise<void> {
  const f = o.fetchFn ?? fetch;
  const intentos = (o.reintentos ?? 1) + 1;
  let ultimo: Error = new Error('sin intentos');
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await f(`${o.baseUrl.replace(/\/$/, '')}/webhook/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sigec-secret': o.secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      });
      const texto = await res.text();
      let json: { ok?: boolean; error?: string } = {};
      try {
        json = JSON.parse(texto);
      } catch {
        /* cuerpo no JSON */
      }
      if (res.ok && json.ok !== false) return;
      // 4xx (secreto incorrecto, datos invalidos) no se arregla reintentando; 5xx y ok:false del canal si.
      throw new FalloN8n(`n8n respondio ${res.status}${json.error ? `: ${json.error}` : ''}`, res.status >= 500);
    } catch (e) {
      ultimo = e instanceof Error ? e : new Error(String(e));
      const reintentable = e instanceof FalloN8n ? e.reintentable : true; // red/timeout: si
      if (!reintentable || i === intentos) break;
      await new Promise((r) => setTimeout(r, o.esperaMs ?? 500));
    }
  }
  const causa = ultimo.name === 'TimeoutError' || ultimo.name === 'AbortError' ? 'timeout' : ultimo.message;
  throw new Error(`no se pudo entregar via n8n (${causa})`);
}

/** Adaptador de salida: delega el envio al workflow `enviar-notificacion` de n8n (Mailtrap / Telegram). */
export class N8nSender implements NotificationSender {
  readonly requiereDestinatario = true;
  constructor(private readonly o: N8nOptions) {}

  enviar(m: { canal: Canal; destinatario: string; mensaje: Mensaje; notificacionId: string }): Promise<void> {
    return postWebhook(this.o, 'enviar-notificacion', {
      canal: m.canal,
      destinatario: m.destinatario,
      plantilla: m.mensaje.plantilla,
      datos: { asunto: m.mensaje.asunto, texto: m.mensaje.texto, html: m.mensaje.html },
      notificacionId: m.notificacionId,
    });
  }
}

/** Alertas internas: workflow `alerta-interna` (chat de Telegram de administradores). Nunca lanza. */
export class N8nAlerta implements AlertaPort {
  constructor(
    private readonly o: N8nOptions,
    private readonly log: (m: string) => void = () => undefined,
  ) {}

  async alertar(texto: string): Promise<void> {
    try {
      await postWebhook(this.o, 'alerta-interna', { texto: `[SIGEC] ${texto}`.slice(0, 1000) });
    } catch (e) {
      this.log(`no se pudo enviar la alerta interna: ${(e as Error).message} | ${texto}`);
    }
  }
}

/** Solo registra la alerta en el log (modo simulado / sin n8n). */
export class LogAlerta implements AlertaPort {
  constructor(private readonly log: (m: string) => void) {}
  async alertar(texto: string): Promise<void> {
    this.log(`[ALERTA] ${texto}`);
  }
}
