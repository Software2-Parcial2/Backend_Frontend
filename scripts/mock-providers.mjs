#!/usr/bin/env node
// Servidor simulado de Mailtrap, Telegram y de los endpoints /internal de MS8, para probar los workflows de n8n SIN servicios
// externos ni credenciales reales.  node scripts/mock-providers.mjs [puerto]
//   Mailtrap:  POST /api/send/:inbox            (exige Authorization: Bearer test-token)
//   Telegram:  POST /bot:token/sendMessage ; GET /bot:token/getUpdates
//   MS8:       POST /internal/telegram/vincular ; GET /internal/recordatorios/pendientes ; POST /internal/recordatorios/:id/enviar
//   Control:   POST /__mock/updates | /__mock/citas | /__mock/fail ;  GET|DELETE /__mock/log
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 9099);
const SECRET_MS8 = process.env.MS8_INTERNAL_SECRET ?? '';
const log = [];
let updates = [];
let citas = [];
let fail = { email: false, telegram: false };

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const h = req.headers;

  if (url.pathname === '/__mock/log') {
    if (req.method === 'DELETE') log.length = 0;
    return send(res, 200, log);
  }
  if (url.pathname === '/__mock/updates') return send(res, 200, (updates = body));
  if (url.pathname === '/__mock/citas') return send(res, 200, (citas = body));
  if (url.pathname === '/__mock/fail') return send(res, 200, (fail = { ...fail, ...body }));

  let m;
  if ((m = url.pathname.match(/^\/api\/send\/(\d+)$/)) && req.method === 'POST') {
    if (h.authorization !== 'Bearer test-token') return send(res, 401, { errors: ['Unauthorized'] });
    if (fail.email) return send(res, 500, { errors: ['mailtrap caido (simulado)'] });
    log.push({ kind: 'email', inbox: m[1], to: body.to?.[0]?.email, from: body.from?.email, subject: body.subject, text: body.text, html: body.html, category: body.category });
    return send(res, 200, { success: true, message_ids: ['1'] });
  }
  if ((m = url.pathname.match(/^\/bot([^/]+)\/sendMessage$/)) && req.method === 'POST') {
    if (fail.telegram) return send(res, 400, { ok: false, description: 'Bad Request: chat not found (simulado)' });
    log.push({ kind: 'telegram', token: m[1], chat_id: String(body.chat_id), text: body.text });
    return send(res, 200, { ok: true, result: { message_id: 1 } });
  }
  if ((m = url.pathname.match(/^\/bot([^/]+)\/getUpdates$/))) {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return send(res, 200, { ok: true, result: updates.filter((u) => u.update_id >= offset) });
  }
  if (url.pathname.startsWith('/internal/')) {
    if (!SECRET_MS8 || h['x-sigec-secret'] !== SECRET_MS8) return send(res, 401, { ok: false, error: 'secreto interno invalido' });
    if (url.pathname === '/internal/telegram/vincular') {
      log.push({ kind: 'ms8-vincular', codigo: body.codigo, chatId: body.chatId });
      return body.codigo === 'VALID123' ? send(res, 200, { ok: true, pacienteId: 'a0000000-0000-4000-8000-000000000001' }) : send(res, 404, { ok: false, error: 'codigo inexistente, expirado o ya usado' });
    }
    if (url.pathname === '/internal/recordatorios/pendientes') return send(res, 200, { citas });
    if ((m = url.pathname.match(/^\/internal\/recordatorios\/([^/]+)\/enviar$/))) {
      log.push({ kind: 'ms8-recordatorio', citaId: m[1] });
      return send(res, 200, { ok: true, estado: 'ENVIADA', intentos: 1 });
    }
  }
  send(res, 404, { error: `sin ruta ${req.method} ${url.pathname}` });
}).listen(port, () => console.log(`mock-providers escuchando en :${port}`));
