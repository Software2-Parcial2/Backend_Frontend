import { createServer, type IncomingMessage, type Server } from 'node:http';
import { N8nAlerta, N8nSender } from './n8n-sender.js';

/** n8n simulado: valida el secreto y devuelve lo que el test programe. */
function n8nFalso() {
  const llamadas: { path: string; secret?: string; body: Record<string, unknown> }[] = [];
  const respuestas: { status?: number; body?: unknown; demoraMs?: number }[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    llamadas.push({ path: req.url ?? '', secret: req.headers['x-sigec-secret'] as string | undefined, body: JSON.parse(raw || '{}') });
    const r = respuestas.shift() ?? { status: 200, body: { ok: true } };
    if (r.demoraMs) await new Promise((x) => setTimeout(x, r.demoraMs));
    res.writeHead(r.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body ?? { ok: true }));
  });
  return { server, llamadas, respuestas };
}

describe('N8nSender / N8nAlerta (n8n simulado)', () => {
  const n8n = n8nFalso();
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => n8n.server.listen(0, r));
    base = `http://localhost:${(n8n.server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise((r) => n8n.server.close(r)));
  beforeEach(() => {
    n8n.llamadas.length = 0;
    n8n.respuestas.length = 0;
  });

  const msg = { plantilla: 'cita-confirmada', asunto: 'Tu cita esta confirmada', texto: 'Hola', html: '<p>Hola</p>' };
  const envio = { canal: 'EMAIL' as const, destinatario: 'a@x.com', mensaje: msg, notificacionId: 'n-1', pacienteId: 'p-1' };
  const sender = (o = {}) => new N8nSender({ baseUrl: base, secret: 's3cr3to', timeoutMs: 300, reintentos: 1, esperaMs: 10, ...o });

  it('llama al webhook enviar-notificacion con el secreto y el contrato {canal, destinatario, plantilla, datos, notificacionId}', async () => {
    await sender().enviar(envio);
    expect(n8n.llamadas).toHaveLength(1);
    expect(n8n.llamadas[0]).toMatchObject({ path: '/webhook/enviar-notificacion', secret: 's3cr3to' });
    expect(n8n.llamadas[0].body).toEqual({
      canal: 'EMAIL',
      destinatario: 'a@x.com',
      plantilla: 'cita-confirmada',
      datos: { asunto: 'Tu cita esta confirmada', texto: 'Hola', html: '<p>Hola</p>' },
      notificacionId: 'n-1',
    });
  });

  it('un 5xx se reintenta una vez y si luego responde bien, tiene exito', async () => {
    n8n.respuestas.push({ status: 502, body: { ok: false, error: 'mailtrap caido' } }, { status: 200, body: { ok: true } });
    await sender().enviar(envio);
    expect(n8n.llamadas).toHaveLength(2);
  });

  it('si el canal falla siempre, lanza con el motivo tras agotar los reintentos', async () => {
    n8n.respuestas.push({ status: 502, body: { ok: false, error: 'mailtrap caido' } }, { status: 502, body: { ok: false, error: 'mailtrap caido' } });
    await expect(sender().enviar(envio)).rejects.toThrow(/n8n respondio 502: mailtrap caido/);
    expect(n8n.llamadas).toHaveLength(2);
  });

  it('un 401 (secreto incorrecto) NO se reintenta', async () => {
    n8n.respuestas.push({ status: 401, body: { ok: false, error: 'no autorizado' } });
    await expect(sender({ secret: 'malo' }).enviar(envio)).rejects.toThrow(/401/);
    expect(n8n.llamadas).toHaveLength(1);
  });

  it('200 con ok:false se trata como fallo', async () => {
    n8n.respuestas.push({ status: 200, body: { ok: false, error: 'chat no encontrado' } });
    await expect(sender({ reintentos: 0 }).enviar(envio)).rejects.toThrow(/chat no encontrado/);
  });

  it('un timeout lanza un error claro y respeta el numero de reintentos', async () => {
    n8n.respuestas.push({ demoraMs: 700 }, { demoraMs: 700 });
    await expect(sender().enviar(envio)).rejects.toThrow(/timeout/);
    expect(n8n.llamadas).toHaveLength(2);
  });

  it('con n8n apagado falla sin colgarse', async () => {
    await expect(new N8nSender({ baseUrl: 'http://localhost:1', secret: 's', timeoutMs: 300, reintentos: 0 }).enviar(envio)).rejects.toThrow(/no se pudo entregar/);
  });

  it('la alerta interna usa el webhook alerta-interna y NUNCA lanza aunque falle', async () => {
    const logs: string[] = [];
    await new N8nAlerta({ baseUrl: base, secret: 's3cr3to', timeoutMs: 300, reintentos: 0 }, (m) => logs.push(m)).alertar('algo fallo');
    expect(n8n.llamadas[0]).toMatchObject({ path: '/webhook/alerta-interna', secret: 's3cr3to' });
    expect(String(n8n.llamadas[0].body.texto)).toBe('[SIGEC] algo fallo');
    n8n.respuestas.push({ status: 500, body: { ok: false } });
    await expect(new N8nAlerta({ baseUrl: base, secret: 's', timeoutMs: 300, reintentos: 0 }, (m) => logs.push(m)).alertar('x')).resolves.toBeUndefined();
    expect(logs.join()).toMatch(/no se pudo enviar la alerta/);
  });
});
