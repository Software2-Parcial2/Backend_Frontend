// Arnes de pruebas en navegador REAL (Chromium headless por CDP, sin dependencias): login con Keycloak, esperas por condicion,
// captura de errores de consola y de respuestas HTTP >= 400 inesperadas. Lo usan los escenarios de cada app.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHELL = process.env.SHELL_URL ?? 'http://localhost:5173';
export const PWA = process.env.PWA_URL ?? 'http://localhost:5174';
export const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8090';
export const KEYCLOAK = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const CHROME = process.env.CHROME_BIN ?? path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let fallos = 0;
const detalle = [];
export function comprobar(nombre, condicion, extra = '') {
  if (condicion) {
    ok++;
    console.log(`  ok    ${nombre}`);
  } else {
    fallos++;
    detalle.push(nombre);
    console.log(`  FALLO ${nombre}${extra ? ` (${extra})` : ''}`);
  }
}
export const seccion = (t) => console.log(`\n== ${t}`);
export function resumen() {
  console.log(`\n== Resumen\n  ${ok} ok, ${fallos} fallos`);
  if (fallos) console.log('  ' + detalle.join('\n  '));
  return fallos === 0;
}

/** Abre un Chromium con perfil nuevo y devuelve el piloto. `permitidos`: fragmentos de URL cuyos 4xx se esperan (y no cuentan). */
export async function abrirNavegador({ nombre = 'p', ancho = 1280, alto = 900, permitidos = [] } = {}) {
  const puerto = 9300 + Math.floor(Math.random() * 500);
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), `sigec-e2e-${nombre}-`));
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${puerto}`, `--window-size=${ancho},${alto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const t = (await (await fetch(`http://localhost:${puerto}/json`)).json()).find((x) => x.type === 'page');
      if (t) {
        ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((r, e) => ((ws.onopen = r), (ws.onerror = e)));
      }
    } catch {
      await dormir(200);
    }
  }
  if (!ws) throw new Error('No se pudo conectar con Chromium');
  let id = 0;
  const pend = new Map();
  const consola = [];
  const http = [];
  const peticiones = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      d.error ? pend.get(d.id).no(new Error(d.error.message)) : pend.get(d.id).ok(d.result);
      pend.delete(d.id);
    } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
      consola.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    } else if (d.method === 'Runtime.exceptionThrown') {
      consola.push('EXC: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
    } else if (d.method === 'Network.requestWillBeSent') {
      peticiones.set(d.params.requestId, { url: d.params.request.url, metodo: d.params.request.method });
    } else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) {
      const p = peticiones.get(d.params.requestId);
      http.push({ estado: d.params.response.status, url: d.params.response.url, metodo: p?.metodo ?? '' });
    } else if (d.method === 'Network.loadingFailed' && !d.params.canceled) {
      const p = peticiones.get(d.params.requestId);
      http.push({ estado: 0, url: p?.url ?? '?', metodo: p?.metodo ?? '', motivo: d.params.errorText });
    }
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    const i = ++id;
    pend.set(i, { ok, no });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  const p = {
    consola,
    http,
    send,
    /** Evalua una expresion en la pagina (con await) y devuelve su valor. */
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    },
    /** Espera hasta que `expr` (JS en la pagina) sea verdadera. Devuelve su valor o lanza si pasa el tiempo. */
    async esperar(expr, ms = 15000, que = expr) {
      const fin = Date.now() + ms;
      let ultimo;
      while (Date.now() < fin) {
        try {
          ultimo = await p.ev(expr);
          if (ultimo) return ultimo;
        } catch {
          /* la pagina puede estar navegando */
        }
        await dormir(150);
      }
      throw new Error(`Tiempo agotado esperando: ${que}`);
    },
    async intentar(expr, ms = 15000) {
      try {
        return await p.esperar(expr, ms);
      } catch {
        return false;
      }
    },
    async ir(url) {
      await send('Page.navigate', { url });
      await dormir(300);
    },
    async hash(h) {
      await p.ev(`location.hash = ${JSON.stringify(h)}`);
      await dormir(200);
    },
    texto: (sel = 'body') => p.ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`),
    existe: (sel) => p.ev(`!!document.querySelector(${JSON.stringify(sel)})`),
    cuenta: (sel) => p.ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    /** Clic en el primer elemento que coincide con `sel` y, si se indica, cuyo texto contiene `texto`. */
    clic: (sel, texto) => p.ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>!${JSON.stringify(texto ?? '')}||x.textContent.includes(${JSON.stringify(texto ?? '')}));if(!e)return false;e.click();return true})()`),
    /** Escribe en un input/textarea/select como lo haria un usuario (dispara input y change). */
    escribir: (sel, valor) => p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(valor)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`),
    async captura(nombreArchivo) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const dir = process.env.CAPTURAS ?? path.join(os.tmpdir(), 'sigec-capturas');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${nombreArchivo}.png`), Buffer.from(r.data, 'base64'));
    },
    /** Corta o devuelve la red (modo avion) para probar el trabajo sin conexion. */
    async red(conectada) {
      await send('Network.emulateNetworkConditions', { offline: !conectada, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    },
    /** Login en Keycloak desde la pagina actual (shell o PWA): pulsa el boton de acceso y llena el formulario. */
    async login(usuario, clave = 'Sigec123!') {
      await p.esperar(`[...document.querySelectorAll('button')].some(b=>/SSO|Iniciar|Entrar|Ingresar/i.test(b.textContent))`, 20000, 'boton de acceso');
      await p.clic('button', 'SSO').then((h) => h || p.clic('button', 'Iniciar')).then((h) => h || p.clic('button', 'Entrar'));
      await p.esperar(`!!document.querySelector('#username')`, 20000, 'formulario de Keycloak');
      await p.escribir('#username', usuario);
      await p.escribir('#password', clave);
      await p.clic('#kc-login');
      await p.esperar(`!location.href.includes('/realms/') && !!document.querySelector('.side, header, [data-testid=username], nav, main')`, 25000, 'volver al sitio tras el login');
      await dormir(800);
    },
    /** Errores de consola y respuestas >=400 que NO estaban permitidas. */
    problemas() {
      const inesperados = http.filter((h) => !permitidos.some((x) => h.url.includes(x) || `${h.estado}` === x));
      const ruido = /Download the React DevTools|favicon|\[vite\]|Failed to load resource/;
      return { consola: consola.filter((c) => !ruido.test(c)), http: inesperados };
    },
    limpiarProblemas() {
      consola.length = 0;
      http.length = 0;
    },
    cerrar() {
      try { ws.close(); } catch {}
      chrome.kill();
      try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
    },
  };
  return p;
}

/** Token de un usuario de Keycloak por contrasena (para preparar datos por API). */
export async function token(usuario, clave = 'Sigec123!') {
  const r = await fetch(`${KEYCLOAK}/realms/sigec/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'sigec-shell', username: usuario, password: clave }) });
  return (await r.json()).access_token;
}

/** Llamada al gateway con token y Idempotency-Key (para preparar o limpiar datos). */
export async function api(metodo, ruta, tk, cuerpo) {
  const r = await fetch(`${GATEWAY}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(metodo !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let datos = null;
  try { datos = await r.json(); } catch {}
  return { estado: r.status, datos };
}

/** Administrador del reino master: para borrar usuarios de prueba. */
export async function borrarUsuarioKeycloak(username) {
  const env = process.env;
  const m = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: env.KEYCLOAK_ADMIN ?? 'admin', password: env.KEYCLOAK_ADMIN_PASSWORD ?? '' }) });
  const t = (await m.json()).access_token;
  const us = await (await fetch(`${KEYCLOAK}/admin/realms/sigec/users?username=${encodeURIComponent(username)}&exact=true`, { headers: { Authorization: `Bearer ${t}` } })).json();
  for (const u of us) await fetch(`${KEYCLOAK}/admin/realms/sigec/users/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
  return us.length;
}
