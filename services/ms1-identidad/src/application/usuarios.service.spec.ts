import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ReglaIdentidadError, type EventoAuth, type NuevoUsuario, type Sesion, type Usuario } from '../domain/identidad.js';
import type { KeycloakAdminPort } from './ports.js';
import { CursorInvalidoError, UsuariosService } from './usuarios.service.js';

const ADMIN = { sub: randomUUID(), username: 'root' };

function usuario(o: Partial<Usuario> = {}): Usuario {
  return { id: randomUUID(), username: 'u', email: 'u@x.com', nombre: 'U', apellido: 'X', activo: true, roles: ['recepcion'], pacienteId: null, medicoId: null, especialidad: null, matricula: null, creadoEn: '2026-01-01T00:00:00.000Z', ...o };
}

function montar(usuarios: Usuario[] = []) {
  const mapa = new Map(usuarios.map((u) => [u.id, u]));
  const llamadas: string[] = [];
  const kc: KeycloakAdminPort = {
    listarUsuarios: vi.fn(async (_f, desde, limite) => [...mapa.values()].slice(desde, desde + limite)),
    obtenerUsuario: async (id) => mapa.get(id) ?? null,
    crearUsuario: vi.fn(async (n: NuevoUsuario) => {
      const u = usuario({ username: n.username, email: n.email, roles: n.roles, pacienteId: n.pacienteId ?? null });
      mapa.set(u.id, u);
      return u;
    }),
    actualizarUsuario: vi.fn(async (id) => mapa.get(id)!),
    habilitar: vi.fn(async (id, activo) => void (mapa.get(id)!.activo = activo)),
    asignarRoles: vi.fn(async (id, roles) => void (mapa.get(id)!.roles = roles)),
    contarAdministradoresActivos: async () => [...mapa.values()].filter((u) => u.roles.includes('administrador') && u.activo).length,
    enviarRecuperacion: vi.fn(async () => undefined),
    enviarInvitacion: vi.fn(async () => undefined),
    buscarPorPaciente: async (pid) => [...mapa.values()].find((u) => u.pacienteId === pid) ?? null,
    tieneContrasena: async () => false,
    sesionesDeUsuario: async () => [] as Sesion[],
    sesionesDelReino: async () => [] as Sesion[],
    cerrarSesion: vi.fn(async () => undefined),
    cerrarSesionesDeUsuario: vi.fn(async (id) => void llamadas.push(`logout:${id}`)),
    eventos: async () => [] as EventoAuth[],
  };
  const auditoria: { actor: string; accion: string; objetivo: string }[] = [];
  const svc = new UsuariosService(kc, { registrar: (a) => void auditoria.push(a), recientes: (n) => auditoria.slice(-n) as never });
  return { svc, kc, mapa, auditoria, llamadas };
}

const nuevo = (o: Partial<NuevoUsuario> = {}): NuevoUsuario => ({ username: 'ana.perez', email: 'ana@x.com', nombre: 'Ana', apellido: 'Perez', roles: ['recepcion'], ...o });

describe('UsuariosService.crear', () => {
  it('crea y audita; normaliza el usuario y quita roles repetidos', async () => {
    const t = montar();
    const u = await t.svc.crear(ADMIN, nuevo({ username: ' Ana.Perez ', roles: ['recepcion', 'recepcion'] }));
    expect(u.username).toBe('ana.perez');
    expect(t.kc.crearUsuario).toHaveBeenCalledWith(expect.objectContaining({ username: 'ana.perez', roles: ['recepcion'] }));
    expect(t.auditoria).toEqual([
      expect.objectContaining({ actor: ADMIN.sub, accion: 'USUARIO_CREADO', objetivo: u.id }),
      expect.objectContaining({ actor: ADMIN.sub, accion: 'INVITACION_ENVIADA', objetivo: u.id }),
    ]);
  });

  it('sin contrasena temporal envia la invitacion; con ella no', async () => {
    const t = montar();
    const sin = await t.svc.crear(ADMIN, nuevo());
    expect(t.kc.enviarInvitacion).toHaveBeenCalledWith(sin.id);
    expect(sin.invitacion).toEqual({ enviada: true, detalle: null });
    const con = await t.svc.crear(ADMIN, nuevo({ username: 'beto', email: 'b@x.com', passwordTemporal: '12345678' }));
    expect(t.kc.enviarInvitacion).toHaveBeenCalledTimes(1);
    expect(con.invitacion).toBeUndefined();
  });

  it('si el correo no sale (sin SMTP) la cuenta queda creada e informa el motivo', async () => {
    const t = montar();
    vi.mocked(t.kc.enviarInvitacion).mockRejectedValueOnce(new Error('Keycloak no pudo enviar el correo (revisa la configuracion SMTP del reino)'));
    const u = await t.svc.crear(ADMIN, nuevo());
    expect(t.mapa.has(u.id)).toBe(true);
    expect(u.invitacion).toEqual({ enviada: false, detalle: expect.stringMatching(/SMTP/) });
  });

  it.each([
    ['usuario con mayusculas/espacios internos', nuevo({ username: 'ana perez' }), 'USERNAME_INVALIDO'],
    ['usuario demasiado corto', nuevo({ username: 'ab' }), 'USERNAME_INVALIDO'],
    ['paciente sin pacienteId', nuevo({ roles: ['paciente'] }), 'PACIENTE_REQUERIDO'],
    ['paciente con rol de personal', nuevo({ roles: ['paciente', 'caja'], pacienteId: randomUUID() }), 'ROLES_INCOMPATIBLES'],
    ['pacienteId en un usuario de personal', nuevo({ pacienteId: randomUUID() }), 'VINCULO_INVALIDO'],
    ['pacienteId que no es UUID', nuevo({ roles: ['paciente'], pacienteId: 'abc' }), 'VINCULO_INVALIDO'],
    ['datos de medico sin el rol medico', nuevo({ matricula: 'M-1' }), 'VINCULO_INVALIDO'],
    ['contrasena temporal debil', nuevo({ passwordTemporal: '123' }), 'PASSWORD_DEBIL'],
    ['sin roles', nuevo({ roles: [] }), 'ROL_INVALIDO'],
  ])('rechaza %s', async (_n, datos, code) => {
    const t = montar();
    await expect(t.svc.crear(ADMIN, datos)).rejects.toMatchObject({ code, status: 422 });
    expect(t.kc.crearUsuario).not.toHaveBeenCalled();
  });

  it('un medico lleva medicoId, especialidad y matricula; un paciente su pacienteId', async () => {
    const t = montar();
    await t.svc.crear(ADMIN, nuevo({ username: 'dra.gomez', roles: ['medico'], medicoId: randomUUID(), especialidad: 'pediatria', matricula: 'M-9' }));
    await t.svc.crear(ADMIN, nuevo({ username: 'carla', roles: ['paciente'], pacienteId: randomUUID() }));
    expect(t.kc.crearUsuario).toHaveBeenCalledTimes(2);
  });
});

describe('autoproteccion y ultimo administrador', () => {
  it('no puedes deshabilitarte ni quitarte el rol administrador', async () => {
    const yo = usuario({ id: ADMIN.sub, roles: ['administrador'] });
    const otro = usuario({ roles: ['administrador'] });
    const t = montar([yo, otro]);
    await expect(t.svc.habilitar(ADMIN, yo.id, false)).rejects.toMatchObject({ code: 'AUTOPROTECCION', status: 409 });
    await expect(t.svc.cambiarRoles(ADMIN, yo.id, ['recepcion'])).rejects.toMatchObject({ code: 'AUTOPROTECCION' });
    expect(t.kc.habilitar).not.toHaveBeenCalled();
    expect(t.kc.asignarRoles).not.toHaveBeenCalled();
  });

  it('nunca deja al sistema sin administrador activo', async () => {
    const unico = usuario({ roles: ['administrador'] });
    const t = montar([unico]);
    await expect(t.svc.habilitar(ADMIN, unico.id, false)).rejects.toMatchObject({ code: 'ULTIMO_ADMINISTRADOR', status: 409 });
    await expect(t.svc.cambiarRoles(ADMIN, unico.id, ['caja'])).rejects.toMatchObject({ code: 'ULTIMO_ADMINISTRADOR' });
    const segundo = usuario({ roles: ['administrador'] });
    t.mapa.set(segundo.id, segundo);
    await expect(t.svc.habilitar(ADMIN, unico.id, false)).resolves.toMatchObject({ activo: false });
  });

  it('un administrador ya deshabilitado no cuenta como el ultimo', async () => {
    const inactivo = usuario({ roles: ['administrador'], activo: false });
    const activo = usuario({ roles: ['administrador'] });
    const t = montar([inactivo, activo]);
    await expect(t.svc.cambiarRoles(ADMIN, inactivo.id, ['caja'])).resolves.toMatchObject({ roles: ['caja'] });
  });
});

describe('habilitar, roles y sesiones', () => {
  it('deshabilitar y cambiar roles cierran las sesiones del usuario', async () => {
    const u = usuario();
    const t = montar([u]);
    await t.svc.habilitar(ADMIN, u.id, false);
    await t.svc.habilitar(ADMIN, u.id, true);
    await t.svc.cambiarRoles(ADMIN, u.id, ['caja']);
    expect(t.llamadas).toEqual([`logout:${u.id}`, `logout:${u.id}`]); // al deshabilitar y al cambiar roles; habilitar no
  });

  it('habilitar un usuario ya activo no llama a Keycloak', async () => {
    const u = usuario();
    const t = montar([u]);
    await t.svc.habilitar(ADMIN, u.id, true);
    expect(t.kc.habilitar).not.toHaveBeenCalled();
  });

  it('un paciente no admite roles de personal al cambiar roles', async () => {
    const p = usuario({ roles: ['paciente'], pacienteId: randomUUID() });
    const t = montar([p]);
    await expect(t.svc.cambiarRoles(ADMIN, p.id, ['paciente', 'caja'])).rejects.toMatchObject({ code: 'ROLES_INCOMPATIBLES' });
    // Pasar a medico limpia el vinculo de paciente
    const r = await t.svc.cambiarRoles(ADMIN, p.id, ['medico'], { medicoId: randomUUID(), matricula: 'M-1' });
    expect(r).toMatchObject({ roles: ['medico'], pacienteId: null, matricula: 'M-1' });
    expect(t.kc.actualizarUsuario).toHaveBeenCalledWith(p.id, expect.objectContaining({ pacienteId: null, matricula: 'M-1' }));
  });

  it('al dejar de ser medico se limpian sus datos; pasar a paciente exige pacienteId', async () => {
    const m = usuario({ roles: ['medico'], medicoId: randomUUID(), especialidad: 'pediatria', matricula: 'M-2' });
    const t = montar([m]);
    await expect(t.svc.cambiarRoles(ADMIN, m.id, ['paciente'])).rejects.toMatchObject({ code: 'PACIENTE_REQUERIDO' });
    const r = await t.svc.cambiarRoles(ADMIN, m.id, ['caja']);
    expect(r).toMatchObject({ roles: ['caja'], medicoId: null, especialidad: null, matricula: null });
    expect(t.kc.actualizarUsuario).toHaveBeenCalledWith(m.id, { medicoId: null, especialidad: null, matricula: null });
    const pac = randomUUID();
    expect(await t.svc.cambiarRoles(ADMIN, m.id, ['paciente'], { pacienteId: pac })).toMatchObject({ roles: ['paciente'], pacienteId: pac });
  });

  it('usuario inexistente: 404 con code', async () => {
    const t = montar();
    await expect(t.svc.obtener(randomUUID())).rejects.toMatchObject({ code: 'USUARIO_NO_ENCONTRADO', status: 404 });
    await expect(t.svc.revocarSesiones(ADMIN, randomUUID())).rejects.toBeInstanceOf(ReglaIdentidadError);
  });

  it('recuperar exige correo', async () => {
    const sin = usuario({ email: null });
    const con = usuario({ email: 'a@x.com' });
    const t = montar([sin, con]);
    await expect(t.svc.recuperar(ADMIN, sin.id)).rejects.toMatchObject({ code: 'SIN_CORREO' });
    expect(await t.svc.recuperar(ADMIN, con.id)).toEqual({ enviadoA: 'a@x.com' });
  });

  it('revocar sesiones y cerrar una sesion quedan auditados', async () => {
    const u = usuario();
    const t = montar([u]);
    await t.svc.revocarSesiones(ADMIN, u.id);
    await t.svc.cerrarSesion(ADMIN, 's1');
    expect(t.auditoria.map((a) => a.accion)).toEqual(['SESIONES_REVOCADAS', 'SESION_CERRADA']);
  });
});

describe('paginacion', () => {
  it('pide uno de mas, devuelve cursor y no repite', async () => {
    const t = montar(Array.from({ length: 5 }, (_, i) => usuario({ username: `u${i}` })));
    const p1 = await t.svc.listar({}, 2);
    expect(p1.items.map((u) => u.username)).toEqual(['u0', 'u1']);
    const p2 = await t.svc.listar({}, 2, p1.siguiente!);
    expect(p2.items.map((u) => u.username)).toEqual(['u2', 'u3']);
    const p3 = await t.svc.listar({}, 2, p2.siguiente!);
    expect(p3.items.map((u) => u.username)).toEqual(['u4']);
    expect(p3.siguiente).toBeNull();
  });

  it('un cursor manipulado se rechaza', async () => {
    const t = montar();
    await expect(t.svc.listar({}, 2, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
    await expect(t.svc.listar({}, 2, Buffer.from('{"o":-4}').toString('base64url'))).rejects.toBeInstanceOf(CursorInvalidoError);
  });
});
