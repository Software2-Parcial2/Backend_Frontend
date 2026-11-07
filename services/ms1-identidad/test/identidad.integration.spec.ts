import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { aplicarConvenciones } from '@sigec/http-nest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDITORIA, KEYCLOAK_ADMIN, SONDAS } from '../src/application/ports.js';
import { SONDA_PORT, SaludService } from '../src/application/salud.service.js';
import { UsuariosService } from '../src/application/usuarios.service.js';
import { KeycloakNoDisponibleError, type Usuario } from '../src/domain/identidad.js';
import { AuditoriaEnMemoria } from '../src/infrastructure/auditoria-memoria.js';
import { IdentidadController } from '../src/infrastructure/http/identidad.controller.js';
import { SaludController } from '../src/infrastructure/http/salud.controller.js';

const ISSUER = 'http://localhost:8080/realms/sigec';
const YO = randomUUID();

describe('ms1-identidad por HTTP (JWT firmados, Keycloak simulado)', () => {
  let app: INestApplication;
  let jwks: Server;
  let key: CryptoKey;
  const usuarios = new Map<string, Usuario>();
  let keycloakCaido = false;

  const token = (roles: string[], sub = YO) =>
    new SignJWT({ realm_access: { roles }, preferred_username: `u-${roles[0]}` }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(sub).setIssuer(ISSUER).setIssuedAt().setExpirationTime('5m').sign(key);
  const api = async (metodo: 'get' | 'post' | 'put' | 'delete', ruta: string, roles: string[] | null, cuerpo?: object) => {
    const r = request(app.getHttpServer())[metodo](ruta);
    if (roles) r.set('Authorization', `Bearer ${await token(roles)}`);
    return cuerpo ? r.send(cuerpo) : r;
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    jwks = createServer((_q, res) => res.setHeader('content-type', 'application/json').end(JSON.stringify({ keys: [jwk] })));
    await new Promise<void>((ok) => jwks.listen(0, ok));
    const puerto = (jwks.address() as { port: number }).port;

    const mk = (id: string, o: Partial<Usuario> = {}): Usuario => ({ id, username: `u${id.slice(0, 4)}`, email: 'a@x.com', nombre: 'A', apellido: 'B', activo: true, roles: ['recepcion'], pacienteId: null, medicoId: null, especialidad: null, matricula: null, creadoEn: '2026-01-01T00:00:00.000Z', ...o });
    usuarios.set(YO, mk(YO, { username: 'root', roles: ['administrador'] }));
    const kc = {
      listarUsuarios: async () => { if (keycloakCaido) throw new KeycloakNoDisponibleError('Keycloak no responde: ECONNREFUSED'); return [...usuarios.values()]; },
      obtenerUsuario: async (id: string) => usuarios.get(id) ?? null,
      crearUsuario: async (n: { username: string; roles: Usuario['roles'] }) => { const u = mk(randomUUID(), { username: n.username, roles: n.roles }); usuarios.set(u.id, u); return u; },
      actualizarUsuario: async (id: string) => usuarios.get(id)!,
      habilitar: async (id: string, a: boolean) => void (usuarios.get(id)!.activo = a),
      asignarRoles: async () => undefined,
      contarAdministradoresActivos: async () => 1,
      enviarRecuperacion: async () => undefined,
      sesionesDeUsuario: async () => [],
      sesionesDelReino: async () => [],
      cerrarSesion: async () => undefined,
      cerrarSesionesDeUsuario: async () => undefined,
      eventos: async () => [{ fecha: '2026-01-01T00:00:00.000Z', tipo: 'LOGIN', usuarioId: null, cliente: 'sigec-shell', ip: null, error: null }],
    };
    const mod = await Test.createTestingModule({
      imports: [TerminusModule, AuthModule.forRoot({ issuer: ISSUER, jwksUri: `http://localhost:${puerto}/` })],
      controllers: [IdentidadController, SaludController],
      providers: [
        { provide: KEYCLOAK_ADMIN, useValue: kc },
        { provide: AUDITORIA, useValue: new AuditoriaEnMemoria() },
        { provide: SONDAS, useValue: [{ nombre: 'gateway', url: 'http://x' }, { nombre: 'ms3-citas', url: 'http://y' }] },
        { provide: SONDA_PORT, useValue: { comprobar: async (s: { nombre: string }) => ({ ok: s.nombre !== 'ms3-citas', ms: 3, detalle: s.nombre === 'ms3-citas' ? 'no responde' : null }) } },
        { provide: SaludService, useFactory: (s: never, p: never) => new SaludService(s, p, 100), inject: [SONDAS, SONDA_PORT] },
        UsuariosService,
      ],
    }).compile();
    app = mod.createNestApplication();
    aplicarConvenciones(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    jwks.close();
  });

  it('sin token: 401 problem+json; con otro rol: 403', async () => {
    const sin = await api('get', '/api/identidad/usuarios', null);
    expect(sin.status).toBe(401);
    expect(sin.headers['content-type']).toContain('application/problem+json');
    expect(sin.body.code).toBe('NO_AUTENTICADO');
    for (const rol of ['recepcion', 'medico', 'caja', 'paciente']) {
      const r = await api('get', '/api/identidad/usuarios', [rol]);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PROHIBIDO');
    }
    expect((await api('get', '/api/salud', ['medico'])).status).toBe(403);
    expect((await api('get', '/api/identidad/auditoria', ['caja'])).status).toBe(403);
  });

  it('el administrador lista usuarios con la forma {items, siguiente}', async () => {
    const r = await api('get', '/api/identidad/usuarios?limite=10', ['administrador']);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ items: [{ username: 'root', roles: ['administrador'] }], siguiente: null });
  });

  it('valida los parametros (400 VALIDACION con errors) y el cursor (400 CURSOR_INVALIDO)', async () => {
    const lim = await api('get', '/api/identidad/usuarios?limite=500&rol=otro', ['administrador']);
    expect(lim.status).toBe(400);
    expect(lim.body.code).toBe('VALIDACION');
    expect(lim.body.errors.map((e: { campo: string }) => e.campo).sort()).toEqual(['limite', 'rol']);
    const cur = await api('get', '/api/identidad/usuarios?cursor=zzz', ['administrador']);
    expect(cur.status).toBe(400);
    expect(cur.body.code).toBe('CURSOR_INVALIDO');
    const mal = await api('post', '/api/identidad/usuarios', ['administrador'], { username: 'ab', email: 'no-es-correo', nombre: '', apellido: 'X', roles: ['rey'] });
    expect(mal.status).toBe(400);
    expect(mal.body.errors.length).toBeGreaterThanOrEqual(4);
    expect((await api('post', '/api/identidad/usuarios', ['administrador'], { username: 'ana', email: 'a@x.com', nombre: 'A', apellido: 'B', roles: ['caja'], admin: true })).status).toBe(400); // propiedad desconocida
  });

  it('crear: 201 con el usuario; una regla de negocio es 422 con code', async () => {
    const ok = await api('post', '/api/identidad/usuarios', ['administrador'], { username: 'luis.paz', email: 'l@x.com', nombre: 'Luis', apellido: 'Paz', roles: ['caja'] });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ username: 'luis.paz', roles: ['caja'] });
    const r = await api('post', '/api/identidad/usuarios', ['administrador'], { username: 'pac', email: 'p@x.com', nombre: 'P', apellido: 'P', roles: ['paciente'] });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: 'PACIENTE_REQUERIDO', title: 'Regla de negocio incumplida' });
  });

  it('autoproteccion: el administrador no se deshabilita (409)', async () => {
    const r = await api('post', `/api/identidad/usuarios/${YO}/deshabilitar`, ['administrador']);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('AUTOPROTECCION');
  });

  it('usuario inexistente: 404; id que no es UUID: 400', async () => {
    const r = await api('get', `/api/identidad/usuarios/${randomUUID()}`, ['administrador']);
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('USUARIO_NO_ENCONTRADO');
    expect((await api('get', '/api/identidad/usuarios/abc', ['administrador'])).status).toBe(400);
  });

  it('revocar sesiones responde 204 y deja huella en la auditoria; eventos paginados', async () => {
    const otro = [...usuarios.values()].find((u) => u.username === 'luis.paz')!;
    expect((await api('post', `/api/identidad/usuarios/${otro.id}/revocar-sesiones`, ['administrador'])).status).toBe(204);
    const aud = await api('get', '/api/identidad/auditoria', ['administrador']);
    expect(aud.body.items.map((a: { accion: string }) => a.accion)).toEqual(['SESIONES_REVOCADAS', 'USUARIO_CREADO']);
    expect(aud.body.items[0]).toMatchObject({ actor: YO, objetivo: otro.id });
    const ev = await api('get', '/api/identidad/eventos?tipo=LOGIN', ['administrador']);
    expect(ev.body).toMatchObject({ items: [{ tipo: 'LOGIN' }], siguiente: null });
  });

  it('Keycloak caido: 503 problem+json con code propio', async () => {
    keycloakCaido = true;
    const r = await api('get', '/api/identidad/usuarios', ['administrador']);
    keycloakCaido = false;
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: 'KEYCLOAK_NO_DISPONIBLE', status: 503 });
  });

  it('/api/salud: estado agregado (siempre 200); /health sin autenticacion', async () => {
    const r = await api('get', '/api/salud', ['administrador']);
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('DEGRADADO');
    expect(r.body.servicios).toEqual([
      { nombre: 'gateway', estado: 'OK', ms: 3, detalle: null },
      { nombre: 'ms3-citas', estado: 'CAIDO', ms: 3, detalle: 'no responde' },
    ]);
    expect((await api('get', '/health', null)).status).toBe(200);
  });
});
