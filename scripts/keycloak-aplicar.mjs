#!/usr/bin/env node
// Aplica a un Keycloak YA en marcha lo que SIGEC necesita en el reino `sigec`, de forma idempotente:
//   0. el claim `sub` en los tokens de usuario (scope `basic`; sin el los servicios no distinguen usuarios);
//   1. atributos de usuario medico_id / especialidad / matricula (perfil de usuario) y sus claims en los clientes web/PWA/movil;
//   2. eventos de autenticacion y de administracion;
//   2b. el servidor de correo (SMTP) si KC_SMTP_* esta en .env;
//   3. las cuentas de servicio `sigec-identidad` (administra usuarios) y `sigec-ms7` (agentes programados) con SU secreto del .env.
// (Un reino nuevo ya trae 1 y 2 al importar infra/keycloak/realm-sigec.json; las cuentas de servicio solo las crea este script
// para no guardar secretos en el repositorio.)
//
// Uso: make keycloak-aplicar        (lee .env: KEYCLOAK_URL, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD, MS1_CLIENT_SECRET, MS7_CLIENT_SECRET)
//      node scripts/keycloak-aplicar.mjs --sin-servicio   (omite el paso 3)
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  /* sin .env: se usan las variables del entorno */
}
const env = process.env;
const BASE = (env.KEYCLOAK_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const REALM = env.KEYCLOAK_REALM ?? 'sigec';
const sinServicio = process.argv.includes('--sin-servicio');
const log = (m) => console.log(m);

async function token() {
  const r = await fetch(`${BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: env.KEYCLOAK_ADMIN ?? 'admin', password: env.KEYCLOAK_ADMIN_PASSWORD ?? '' }),
  });
  if (!r.ok) throw new Error(`No se pudo entrar a Keycloak como administrador (${r.status}). Revisa KEYCLOAK_ADMIN/KEYCLOAK_ADMIN_PASSWORD y que ${BASE} este en marcha.`);
  return (await r.json()).access_token;
}

const tk = await token();
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${BASE}/admin/realms/${REALM}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${tk}`, ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok && r.status !== 404 && r.status !== 409) throw new Error(`${metodo} ${ruta} -> ${r.status} ${await r.text()}`);
  return r;
};
const json = async (ruta) => (await api('GET', ruta)).json();

// --- 0. el claim `sub` -----------------------------------------------------------------------------------------
// Keycloak 26 lo aporta el scope `basic`; sin el, el token no trae `sub` y los servicios no distinguen usuarios.
const scopes = await json('/client-scopes');
const basic = scopes.find((s) => s.name === 'basic');
for (const cid of ['sigec-shell', 'sigec-pwa', 'sigec-mobile']) {
  const [c] = await json(`/clients?clientId=${cid}`);
  if (!c || !basic) continue;
  const ya = (await json(`/clients/${c.id}/default-client-scopes`)).some((s) => s.name === 'basic');
  if (!ya) await api('PUT', `/clients/${c.id}/default-client-scopes/${basic.id}`);
  log(`cliente ${cid}: scope basic (claim sub) ${ya ? 'ya estaba' : 'agregado'}`);
}

// --- 1. perfil de usuario y claims ----------------------------------------------------------------------
const perfil = await json('/users/profile');
const nuevos = [
  { name: 'medico_id', displayName: 'Medico vinculado', validations: { pattern: { pattern: '^[0-9a-fA-F-]{36}$', 'error-message': 'formato invalido' } } },
  { name: 'especialidad', displayName: 'Especialidad', validations: { pattern: { pattern: '^[A-Za-z0-9_ -]{1,100}$', 'error-message': 'formato invalido' } } },
  { name: 'matricula', displayName: 'Matricula', validations: { pattern: { pattern: '^[A-Za-z0-9._/-]{1,50}$', 'error-message': 'formato invalido' } } },
].map((a) => ({ ...a, permissions: { view: ['admin'], edit: ['admin'] } }));
const faltan = nuevos.filter((n) => !perfil.attributes.some((a) => a.name === n.name));
if (faltan.length) {
  perfil.attributes.push(...faltan);
  await api('PUT', '/users/profile', perfil);
}
log(`perfil de usuario: ${faltan.length ? 'agregados ' + faltan.map((f) => f.name).join(', ') : 'ya estaba'}`);

const mapper = (n) => ({ name: n, protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-attribute-mapper', config: { 'user.attribute': n, 'claim.name': n, 'jsonType.label': 'String', 'access.token.claim': 'true', 'id.token.claim': 'true', 'userinfo.token.claim': 'true' } });
for (const cid of ['sigec-shell', 'sigec-pwa', 'sigec-mobile']) {
  const [c] = await json(`/clients?clientId=${cid}`);
  if (!c) {
    log(`cliente ${cid}: no existe (se omite)`);
    continue;
  }
  const tiene = new Set((c.protocolMappers ?? []).map((m) => m.name));
  const agregados = [];
  for (const n of ['medico_id', 'especialidad', 'matricula']) {
    if (tiene.has(n)) continue;
    await api('POST', `/clients/${c.id}/protocol-mappers/models`, mapper(n));
    agregados.push(n);
  }
  log(`cliente ${cid}: ${agregados.length ? 'claims agregados ' + agregados.join(', ') : 'claims ya estaban'}`);
}

// --- 2. eventos ------------------------------------------------------------------------------------------
const tipos = ['LOGIN', 'LOGIN_ERROR', 'LOGOUT', 'LOGOUT_ERROR', 'UPDATE_PASSWORD', 'UPDATE_PASSWORD_ERROR', 'RESET_PASSWORD', 'RESET_PASSWORD_ERROR', 'REGISTER', 'REMOVE_TOTP', 'UPDATE_TOTP', 'USER_DISABLED_BY_PERMANENT_LOCKOUT', 'USER_DISABLED_BY_TEMPORARY_LOCKOUT'];
await api('PUT', '/events/config', { eventsEnabled: true, eventsExpiration: 2592000, enabledEventTypes: tipos, eventsListeners: ['jboss-logging'], adminEventsEnabled: true, adminEventsDetailsEnabled: false });
log('eventos: activados (autenticacion y administracion)');

// --- 2b. correo (SMTP) -------------------------------------------------------------------------------------
// Sin esto Keycloak no puede enviar "Olvide mi contrasena" ni los enlaces de activacion. Mailtrap sandbox:
// Email Testing -> Inbox -> SMTP Settings (son credenciales distintas de las de la API que usa n8n).
if (env.KC_SMTP_HOST && env.KC_SMTP_USER && env.KC_SMTP_PASSWORD) {
  const reino = await json('');
  const puerto = env.KC_SMTP_PORT ?? '2525';
  await api('PUT', '', {
    ...reino,
    resetPasswordAllowed: true,
    smtpServer: {
      host: env.KC_SMTP_HOST,
      port: puerto,
      from: env.KC_SMTP_FROM ?? env.MAIL_FROM ?? 'no-reply@sigec.test',
      fromDisplayName: 'SIGEC',
      auth: 'true',
      user: env.KC_SMTP_USER,
      password: env.KC_SMTP_PASSWORD,
      starttls: puerto === '465' ? 'false' : 'true',
      ssl: puerto === '465' ? 'true' : 'false',
    },
  });
  log(`correo: SMTP configurado (${env.KC_SMTP_HOST}:${puerto})`);
} else {
  log('correo: OMITIDO (define KC_SMTP_HOST, KC_SMTP_USER y KC_SMTP_PASSWORD en .env; sin SMTP no funciona "Olvide mi contrasena")');
}

// --- 3. cuentas de servicio ---------------------------------------------------------------------------------
async function cuentaDeServicio({ clientId, nombre, secreto, roles, rolesCliente }) {
  if (!secreto || secreto === 'cambia_esto' || secreto.length < 16) {
    log(`cuenta de servicio ${clientId}: OMITIDA (define un secreto de 16+ caracteres en .env; no se crea con uno vacio o de ejemplo)`);
    return;
  }
  let [c] = await json(`/clients?clientId=${clientId}`);
  if (!c) {
    await api('POST', '/clients', {
      clientId, name: nombre, enabled: true, publicClient: false, protocol: 'openid-connect', secret: secreto, clientAuthenticatorType: 'client-secret',
      standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: false, serviceAccountsEnabled: true, fullScopeAllowed: true,
    });
    [c] = await json(`/clients?clientId=${clientId}`);
    log(`cuenta de servicio ${clientId}: creada`);
  } else {
    // El secreto del .env manda: si cambio, se actualiza.
    await api('PUT', `/clients/${c.id}`, { ...c, secret: secreto, serviceAccountsEnabled: true, publicClient: false });
    log(`cuenta de servicio ${clientId}: ya existia (secreto sincronizado con .env)`);
  }
  const sa = await json(`/clients/${c.id}/service-account-user`);
  if (roles.length) {
    const reales = await Promise.all(roles.map((r) => json(`/roles/${r}`)));
    await api('POST', `/users/${sa.id}/role-mappings/realm`, reales);
  }
  if (rolesCliente.length) {
    const [rm] = await json('/clients?clientId=realm-management');
    const todos = await json(`/clients/${rm.id}/roles`);
    await api('POST', `/users/${sa.id}/role-mappings/clients/${rm.id}`, todos.filter((r) => rolesCliente.includes(r.name)));
  }
  log(`  roles de ${clientId}: ${[...roles, ...rolesCliente.map((r) => 'realm-management/' + r)].join(', ') || '(ninguno)'}`);
}

if (sinServicio) log('cuentas de servicio: omitidas (--sin-servicio)');
else {
  await cuentaDeServicio({
    clientId: env.MS1_CLIENT_ID ?? 'sigec-identidad',
    nombre: 'SIGEC Identidad (administracion de Keycloak)',
    secreto: env.MS1_CLIENT_SECRET,
    roles: [],
    rolesCliente: ['manage-users', 'view-users', 'query-users', 'view-events', 'view-clients', 'query-clients', 'view-realm'],
  });
  await cuentaDeServicio({
    clientId: env.MS7_CLIENT_ID ?? 'sigec-ms7',
    nombre: 'SIGEC MS7 (agentes de monitoreo)',
    secreto: env.MS7_CLIENT_SECRET,
    roles: ['administrador'],
    rolesCliente: [],
  });
}
log('listo');
