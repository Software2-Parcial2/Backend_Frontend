import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KeycloakNoDisponibleError } from '../../domain/identidad.js';
import { KeycloakAdminClient } from './keycloak-admin.client.js';

/** Keycloak minimo en memoria: tokens, usuarios, roles, sesiones y eventos. */
function falsoKeycloak(opts: { rechazaToken?: boolean } = {}) {
  const roles = ['administrador', 'medico', 'recepcion', 'caja', 'paciente', 'offline_access'].map((name) => ({ id: randomUUID(), name }));
  const usuarios = new Map<string, any>();
  const mapeos = new Map<string, string[]>();
  const llamadas: string[] = [];
  let tokens = 0;
  let invalidarSiguiente = false;
  const vacio = (status = 204) => new Response(null, { status });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

  const fetchFn = (async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const metodo = init.method ?? 'GET';
    if (url.pathname.endsWith('/protocol/openid-connect/token')) {
      if (opts.rechazaToken) return json({ error: 'unauthorized_client' }, 401);
      tokens++;
      return json({ access_token: `tok${tokens}`, expires_in: 300 });
    }
    llamadas.push(`${metodo} ${url.pathname.replace('/admin/realms/sigec', '')}${url.search}`);
    if (invalidarSiguiente) {
      invalidarSiguiente = false;
      return vacio(401);
    }
    const ruta = url.pathname.replace('/admin/realms/sigec', '');
    const cuerpo = init.body ? JSON.parse(String(init.body)) : undefined;
    let m: RegExpMatchArray | null;
    if (ruta === '/users' && metodo === 'POST') {
      if ([...usuarios.values()].some((u) => u.username === cuerpo.username)) return json({ errorMessage: 'User exists with same username' }, 409);
      const id = randomUUID();
      usuarios.set(id, { id, createdTimestamp: 1_700_000_000_000, ...cuerpo });
      return new Response(null, { status: 201, headers: { location: `http://kc/admin/realms/sigec/users/${id}` } });
    }
    if (ruta === '/users' && metodo === 'GET') {
      const q = url.searchParams.get('search')?.toLowerCase();
      const filtrados = [...usuarios.values()].filter((u) => !q || u.username.includes(q));
      const first = Number(url.searchParams.get('first') ?? 0);
      return json(filtrados.slice(first, first + Number(url.searchParams.get('max') ?? 100)));
    }
    if ((m = ruta.match(/^\/users\/([^/]+)$/))) {
      const u = usuarios.get(m[1]!);
      if (!u) return json({ error: 'User not found' }, 404);
      if (metodo === 'GET') return json(u);
      if (metodo === 'PUT') {
        Object.assign(u, cuerpo);
        return vacio();
      }
      if (metodo === 'DELETE') {
        usuarios.delete(m[1]!);
        return vacio();
      }
    }
    if ((m = ruta.match(/^\/users\/([^/]+)\/role-mappings\/realm$/))) {
      const actuales = mapeos.get(m[1]!) ?? [];
      if (metodo === 'GET') return json(actuales.map((n) => roles.find((r) => r.name === n)));
      if (metodo === 'POST') mapeos.set(m[1]!, [...actuales, ...cuerpo.map((r: any) => r.name)]);
      if (metodo === 'DELETE') mapeos.set(m[1]!, actuales.filter((n) => !cuerpo.some((r: any) => r.name === n)));
      return vacio();
    }
    if ((m = ruta.match(/^\/roles\/([^/]+)$/))) {
      const r = roles.find((x) => x.name === m![1]);
      return r ? json(r) : json({}, 404);
    }
    if ((m = ruta.match(/^\/roles\/([^/]+)\/users$/))) {
      return json([...usuarios.values()].filter((u) => (mapeos.get(u.id) ?? []).includes(m![1]!)));
    }
    if ((m = ruta.match(/^\/users\/([^/]+)\/execute-actions-email$/))) return vacio(usuarios.get(m[1]!)?.email === 'smtp@falla.com' ? 500 : 204);
    if ((m = ruta.match(/^\/users\/([^/]+)\/logout$/))) return vacio();
    if ((m = ruta.match(/^\/users\/([^/]+)\/sessions$/))) {
      return json([{ id: 's1', username: usuarios.get(m[1]!)?.username, userId: m[1], ipAddress: '10.0.0.1', start: 1_700_000_000_000, lastAccess: 1_700_000_100_000, clients: { c1: 'sigec-shell' } }]);
    }
    if (ruta === '/clients') return json([{ id: 'uuid-shell', clientId: 'sigec-shell' }, { id: 'uuid-pwa', clientId: 'sigec-pwa' }, { id: 'uuid-otro', clientId: 'account' }]);
    if ((m = ruta.match(/^\/clients\/([^/]+)\/user-sessions$/))) {
      const base = { username: 'u', userId: 'x', ipAddress: '1.1.1.1', start: 1_700_000_000_000, clients: {} };
      if (m[1] === 'uuid-shell') return json([{ ...base, id: 'sa', lastAccess: 1_700_000_300_000 }, { ...base, id: 'sb', lastAccess: 1_700_000_100_000 }]);
      if (m[1] === 'uuid-pwa') return json([{ ...base, id: 'sa', lastAccess: 1_700_000_300_000 }, { ...base, id: 'sc', lastAccess: 1_700_000_200_000 }]);
      return json([]);
    }
    if ((m = ruta.match(/^\/sessions\/([^/]+)$/))) return vacio(m[1] === 'sa' ? 204 : 404);
    if (ruta === '/events') return json([{ time: 1_700_000_000_000, type: 'LOGIN_ERROR', userId: 'u1', clientId: 'sigec-shell', ipAddress: '2.2.2.2', error: 'invalid_user_credentials' }]);
    return json({ error: `ruta no simulada ${metodo} ${ruta}` }, 500);
  }) as typeof fetch;

  return { fetchFn, usuarios, mapeos, llamadas, tokens: () => tokens, invalidarSiguiente: () => (invalidarSiguiente = true) };
}

const cliente = (kc: ReturnType<typeof falsoKeycloak>) => new KeycloakAdminClient({ url: 'http://kc', realm: 'sigec', clientId: 'sigec-identidad', clientSecret: 's', fetchFn: kc.fetchFn });

describe('KeycloakAdminClient', () => {
  it('crea el usuario con atributos, contrasena temporal y roles, y lo devuelve completo', async () => {
    const kc = falsoKeycloak();
    const pac = randomUUID();
    const u = await cliente(kc).crearUsuario({ username: 'carla', email: 'c@x.com', nombre: 'Carla', apellido: 'Rojas', roles: ['paciente'], pacienteId: pac, passwordTemporal: 'Temporal123' });
    expect(u).toMatchObject({ username: 'carla', roles: ['paciente'], pacienteId: pac, activo: true, nombre: 'Carla' });
    const guardado = [...kc.usuarios.values()][0];
    expect(guardado.attributes).toEqual({ paciente_id: [pac] });
    expect(guardado.credentials).toEqual([{ type: 'password', value: 'Temporal123', temporary: true }]);
    expect(guardado.requiredActions).toEqual([]);
  });

  it('sin contrasena temporal exige UPDATE_PASSWORD; un duplicado es 409 USUARIO_DUPLICADO', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    await c.crearUsuario({ username: 'ana', email: 'a@x.com', nombre: 'A', apellido: 'B', roles: ['recepcion'] });
    expect([...kc.usuarios.values()][0].requiredActions).toEqual(['UPDATE_PASSWORD']);
    await expect(c.crearUsuario({ username: 'ana', email: 'o@x.com', nombre: 'A', apellido: 'B', roles: ['recepcion'] })).rejects.toMatchObject({ code: 'USUARIO_DUPLICADO', status: 409 });
  });

  it('si falla asignar el rol deshace el usuario (no queda huerfano)', async () => {
    const kc = falsoKeycloak();
    await expect(cliente(kc).crearUsuario({ username: 'x1', email: 'x@x.com', nombre: 'A', apellido: 'B', roles: ['inexistente' as never] })).rejects.toMatchObject({ code: 'ROL_INVALIDO' });
    expect(kc.usuarios.size).toBe(0);
  });

  it('cambiar roles quita los propios que sobran, agrega los que faltan y no toca roles ajenos (offline_access)', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    const u = await c.crearUsuario({ username: 'dr', email: 'd@x.com', nombre: 'D', apellido: 'R', roles: ['medico', 'recepcion'] });
    kc.mapeos.get(u.id)!.push('offline_access');
    await c.asignarRoles(u.id, ['medico', 'caja']);
    expect(kc.mapeos.get(u.id)!.sort()).toEqual(['caja', 'medico', 'offline_access']);
    expect((await c.obtenerUsuario(u.id))!.roles.sort()).toEqual(['caja', 'medico']); // offline_access no es un rol de SIGEC
  });

  it('actualizar conserva lo que no se toca y borra un atributo con null', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    const u = await c.crearUsuario({ username: 'dr2', email: 'd@x.com', nombre: 'D', apellido: 'R', roles: ['medico'], medicoId: randomUUID(), matricula: 'M-1', especialidad: 'pediatria' });
    const r = await c.actualizarUsuario(u.id, { nombre: 'Diana', matricula: null });
    expect(r).toMatchObject({ nombre: 'Diana', apellido: 'R', matricula: null, especialidad: 'pediatria', medicoId: u.medicoId });
  });

  it('habilitar y deshabilitar conservan el resto del usuario; listar completa los roles y filtra por rol', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    const a = await c.crearUsuario({ username: 'aa', email: 'a@x.com', nombre: 'A', apellido: 'A', roles: ['caja'] });
    await c.crearUsuario({ username: 'bb', email: 'b@x.com', nombre: 'B', apellido: 'B', roles: ['recepcion'] });
    await c.habilitar(a.id, false);
    expect((await c.obtenerUsuario(a.id))!.activo).toBe(false);
    expect((await c.listarUsuarios({}, 0, 10)).map((u) => [u.username, u.roles[0]])).toEqual([['aa', 'caja'], ['bb', 'recepcion']]);
    expect((await c.listarUsuarios({ rol: 'recepcion' }, 0, 10)).map((u) => u.username)).toEqual(['bb']);
    expect((await c.listarUsuarios({ rol: 'caja', activo: true }, 0, 10))).toEqual([]);
    expect(await c.contarAdministradoresActivos()).toBe(0);
  });

  it('usuario inexistente: obtener devuelve null, el resto 404 con code', async () => {
    const c = cliente(falsoKeycloak());
    expect(await c.obtenerUsuario(randomUUID())).toBeNull();
    await expect(c.habilitar(randomUUID(), true)).rejects.toMatchObject({ code: 'USUARIO_NO_ENCONTRADO', status: 404 });
  });

  it('sesiones del reino: junta los clientes, sin duplicar, mas recientes primero, con paginacion', async () => {
    const c = cliente(falsoKeycloak());
    expect((await c.sesionesDelReino(0, 10)).map((s) => s.id)).toEqual(['sa', 'sc', 'sb']);
    expect((await c.sesionesDelReino(1, 1)).map((s) => s.id)).toEqual(['sc']);
    await expect(c.cerrarSesion('zz')).rejects.toMatchObject({ code: 'SESION_NO_ENCONTRADA', status: 404 });
    await expect(c.cerrarSesion('sa')).resolves.toBeUndefined();
  });

  it('eventos y sesiones de un usuario se traducen a la forma publica', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    expect(await c.eventos({ tipo: 'LOGIN_ERROR' }, 0, 5)).toEqual([{ fecha: '2023-11-14T22:13:20.000Z', tipo: 'LOGIN_ERROR', usuarioId: 'u1', cliente: 'sigec-shell', ip: '2.2.2.2', error: 'invalid_user_credentials' }]);
    expect(kc.llamadas.at(-1)).toContain('type=LOGIN_ERROR');
    const u = await c.crearUsuario({ username: 'ss', email: 's@x.com', nombre: 'S', apellido: 'S', roles: ['caja'] });
    expect((await c.sesionesDeUsuario(u.id))[0]).toMatchObject({ id: 's1', ip: '10.0.0.1', clientes: ['sigec-shell'] });
  });

  it('recuperar: un fallo de correo en Keycloak es un error de servicio explicado', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    const u = await c.crearUsuario({ username: 'sm', email: 'smtp@falla.com', nombre: 'S', apellido: 'S', roles: ['caja'] });
    await expect(c.enviarRecuperacion(u.id)).rejects.toThrow(/SMTP/);
  });

  it('reutiliza el token y lo renueva si Keycloak lo rechaza (401)', async () => {
    const kc = falsoKeycloak();
    const c = cliente(kc);
    await c.contarAdministradoresActivos();
    await c.contarAdministradoresActivos();
    expect(kc.tokens()).toBe(1);
    kc.invalidarSiguiente();
    await expect(c.contarAdministradoresActivos()).resolves.toBe(0);
    expect(kc.tokens()).toBe(2);
  });

  it('credenciales de servicio rechazadas o Keycloak caido: KeycloakNoDisponibleError', async () => {
    await expect(cliente(falsoKeycloak({ rechazaToken: true })).contarAdministradoresActivos()).rejects.toThrow(/rechazo las credenciales/);
    const caido = new KeycloakAdminClient({ url: 'http://kc', realm: 'sigec', clientId: 'x', clientSecret: 'y', fetchFn: (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch });
    await expect(caido.contarAdministradoresActivos()).rejects.toBeInstanceOf(KeycloakNoDisponibleError);
  });
});
