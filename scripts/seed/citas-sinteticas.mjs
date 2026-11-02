#!/usr/bin/env node
// Siembra citas SINTETICAS (ficticias) en MS3 usando la API real (POST /api/citas por el gateway), para tener datos que mostrar
// en el dashboard de MS7. Varias especialidades y medicos, varios meses hacia ADELANTE (MS3 solo acepta fechas futuras).
// Repetible: las Idempotency-Key y los ids se derivan de forma determinista, asi que repetir el script reproduce la peticion
// (replay) en lugar de duplicar citas.
//
// Requisitos: docker compose up -d, make dynamodb-init rabbitmq-declare, y `scripts/dev-services.sh start gateway ms3 ms6`.
// IMPORTANTE: arranca MS8 con NOTIF_SENDER=simulated (o no lo arranques) para no generar alertas ni correos reales con pacientes inexistentes.
//
//   node scripts/seed/citas-sinteticas.mjs [--meses 4] [--escala 1] [--semilla 42]
import { createHash } from 'node:crypto';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MESES = Number(arg('meses', 4));
const ESCALA = Number(arg('escala', 1));
let semilla = Number(arg('semilla', 42));
const GW = process.env.GATEWAY_URL ?? 'http://localhost:8090';
const KC = `${process.env.KEYCLOAK_URL ?? 'http://localhost:8080'}/realms/sigec/protocol/openid-connect/token`;

// PRNG determinista (mulberry32)
const rnd = () => { semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const uuidDe = (txt) => { const h = createHash('sha1').update(txt).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };

// especialidad -> [citas por dia habil, numero de medicos]
const ESPECIALIDADES = {
  'Medicina General': [9, 4], Pediatria: [7, 3], Ginecologia: [5, 2], Traumatologia: [4, 2],
  Cardiologia: [3, 2], Dermatologia: [3, 1], Oftalmologia: [2, 1], Neurologia: [1, 1],
};
const PACIENTES = Array.from({ length: 80 }, (_, i) => uuidDe(`paciente-sintetico-${i}`));

let token = null, tokenHasta = 0;
async function getToken() {
  if (token && Date.now() < tokenHasta) return token;
  const r = await fetch(KC, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'sigec-shell', username: 'recepcion', password: 'Sigec123!' }) });
  if (!r.ok) throw new Error(`No se pudo obtener el token (${r.status}). ¿Keycloak esta arriba?`);
  token = (await r.json()).access_token; tokenHasta = Date.now() + 3 * 60_000;
  return token;
}

const peticiones = [];
const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
for (let d = 1; d <= MESES * 30; d++) {
  const dia = new Date(hoy.getTime() + d * 86_400_000);
  const dow = dia.getUTCDay(); // 0 = domingo
  if (dow === 0) continue;
  const factorDia = dow === 6 ? 0.3 : [0, 1.15, 1.1, 1.0, 0.95, 0.85][dow];
  for (const [esp, [vol, nMed]] of Object.entries(ESPECIALIDADES)) {
    const n = Math.round(vol * factorDia * ESCALA * (0.7 + rnd() * 0.6));
    const usados = new Set();
    for (let i = 0; i < n; i++) {
      const medico = uuidDe(`medico-${esp}-${Math.floor(rnd() * nMed)}`);
      const manana = rnd() < (esp === 'Pediatria' ? 0.7 : 0.55);
      const hora = manana ? 8 + Math.floor(rnd() * 4) : 14 + Math.floor(rnd() * 4);
      const f = new Date(dia.getTime() + (hora * 60 + (rnd() < 0.5 ? 0 : 30)) * 60_000).toISOString();
      const clave = `${medico}|${f}`;
      if (usados.has(clave)) continue; // un horario por medico
      usados.add(clave);
      peticiones.push({ pacienteId: PACIENTES[Math.floor(rnd() * PACIENTES.length)], medicoId: medico, especialidad: esp, fechaHora: f });
    }
  }
}

let ok = 0, replay = 0, conflicto = 0, otros = 0;
const cola = [...peticiones];
async function trabajador() {
  while (cola.length) {
    const body = cola.shift();
    const r = await fetch(`${GW}/api/citas`, { method: 'POST',
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json', 'Idempotency-Key': uuidDe(`${body.medicoId}|${body.fechaHora}|${body.pacienteId}`) },
      body: JSON.stringify(body) });
    if (r.status === 202) r.headers.get('idempotent-replay') ? replay++ : ok++;
    else if (r.status === 409) conflicto++;
    else { otros++; if (otros <= 3) console.error(`  respuesta inesperada ${r.status}: ${(await r.text()).slice(0, 200)}`); }
    await r.arrayBuffer().catch(() => {});
  }
}
console.log(`Sembrando ${peticiones.length} citas SINTETICAS (${MESES} meses hacia adelante) en ${GW} ...`);
await Promise.all(Array.from({ length: 4 }, trabajador));
console.log(`Listo: creadas=${ok} repetidas(replay)=${replay} horario-ocupado=${conflicto} otros=${otros}`);
process.exit(otros > 0 ? 1 : 0);
