import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { FichaPaciente, NuevoUsuario, Usuario } from '../domain/identidad.js';
import { AccesoPacientesService, dividirNombre, usernameDe } from './acceso-pacientes.service.js';
import type { KeycloakAdminPort, PacientesPort } from './ports.js';

const RECEPCION = { sub: randomUUID(), username: 'recepcion' };
const TOKEN = 'Bearer abc';

function montar(fichas: FichaPaciente[] = []) {
  const usuarios = new Map<string, Usuario>();
  const conClave = new Set<string>();
  const kc = {
    crearUsuario: vi.fn(async (n: NuevoUsuario) => {
      if ([...usuarios.values()].some((u) => u.email === n.email)) throw Object.assign(new Error('dup'), { code: 'USUARIO_DUPLICADO' });
      const u: Usuario = { id: randomUUID(), username: n.username, email: n.email, nombre: n.nombre, apellido: n.apellido, activo: true, roles: n.roles, pacienteId: n.pacienteId ?? null, medicoId: null, especialidad: null, matricula: null, creadoEn: '2026-01-01T00:00:00.000Z' };
      usuarios.set(u.id, u);
      return u;
    }),
    actualizarUsuario: vi.fn(async (id: string, c: { email?: string }) => Object.assign(usuarios.get(id)!, c)),
    enviarInvitacion: vi.fn(async () => undefined),
    buscarPorPaciente: async (pid: string) => [...usuarios.values()].find((u) => u.pacienteId === pid) ?? null,
    tieneContrasena: async (id: string) => conClave.has(id),
  } as unknown as KeycloakAdminPort & { crearUsuario: ReturnType<typeof vi.fn>; enviarInvitacion: ReturnType<typeof vi.fn>; actualizarUsuario: ReturnType<typeof vi.fn> };
  const pacientes: PacientesPort = { obtener: vi.fn(async (id: string) => fichas.find((f) => f.id === id) ?? null) };
  const auditoria: { accion: string }[] = [];
  const svc = new AccesoPacientesService(kc, pacientes, { registrar: (a) => void auditoria.push(a), recientes: () => [] });
  return { svc, kc, pacientes, usuarios, conClave, auditoria };
}

const ficha = (o: Partial<FichaPaciente> = {}): FichaPaciente => ({ id: randomUUID(), nombre: 'Ana Maria Perez Lopez', documento: '1234567 LP', email: 'ana@x.com', ...o });

describe('AccesoPacientesService.invitar', () => {
  it('crea la cuenta de paciente con los datos de la ficha y envia la invitacion', async () => {
    const f = ficha();
    const t = montar([f]);
    const r = await t.svc.invitar(RECEPCION, f.id, TOKEN);
    expect(t.pacientes.obtener).toHaveBeenCalledWith(f.id, TOKEN);
    expect(t.kc.crearUsuario).toHaveBeenCalledWith({ username: 'p.1234567lp', email: 'ana@x.com', nombre: 'Ana Maria', apellido: 'Perez Lopez', roles: ['paciente'], pacienteId: f.id });
    expect(t.kc.enviarInvitacion).toHaveBeenCalledWith(r.usuarioId);
    expect(r).toMatchObject({ pacienteId: f.id, estado: 'INVITACION_PENDIENTE', creada: true, enviada: true, email: 'ana@x.com' });
    expect(t.auditoria.map((a) => a.accion)).toEqual(['USUARIO_CREADO', 'INVITACION_ENVIADA']);
  });

  it('repetirlo reenvia sin crear otra cuenta, y usa el correo corregido en la ficha', async () => {
    const f = ficha();
    const t = montar([f]);
    await t.svc.invitar(RECEPCION, f.id, TOKEN);
    f.email = 'nuevo@x.com';
    const r = await t.svc.invitar(RECEPCION, f.id, TOKEN);
    expect(t.kc.crearUsuario).toHaveBeenCalledTimes(1);
    expect(t.kc.actualizarUsuario).toHaveBeenCalledWith(r.usuarioId, { email: 'nuevo@x.com' });
    expect(t.kc.enviarInvitacion).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ creada: false, enviada: true, email: 'nuevo@x.com' });
  });

  it('si el correo no sale, la cuenta nueva queda creada y lo informa', async () => {
    const f = ficha();
    const t = montar([f]);
    t.kc.enviarInvitacion.mockRejectedValueOnce(new Error('Keycloak no pudo enviar el correo (revisa la configuracion SMTP del reino)'));
    const r = await t.svc.invitar(RECEPCION, f.id, TOKEN);
    expect(r).toMatchObject({ creada: true, enviada: false, detalle: expect.stringMatching(/SMTP/) });
    expect(t.usuarios.size).toBe(1);
  });

  it('al reenviar, un fallo del correo es un error (no hay nada nuevo que informar)', async () => {
    const f = ficha();
    const t = montar([f]);
    await t.svc.invitar(RECEPCION, f.id, TOKEN);
    t.kc.enviarInvitacion.mockRejectedValueOnce(new Error('sin SMTP'));
    await expect(t.svc.invitar(RECEPCION, f.id, TOKEN)).rejects.toThrow('sin SMTP');
  });

  it.each([
    ['pacienteId que no es UUID', () => 'abc', 'VINCULO_INVALIDO', 422],
    ['paciente inexistente', () => randomUUID(), 'PACIENTE_NO_ENCONTRADO', 404],
  ])('rechaza %s', async (_n, id, code, status) => {
    const t = montar();
    await expect(t.svc.invitar(RECEPCION, id(), TOKEN)).rejects.toMatchObject({ code, status });
    expect(t.kc.crearUsuario).not.toHaveBeenCalled();
  });

  it('rechaza una ficha sin correo', async () => {
    const f = ficha({ email: null });
    const t = montar([f]);
    await expect(t.svc.invitar(RECEPCION, f.id, TOKEN)).rejects.toMatchObject({ code: 'SIN_CORREO', status: 422 });
  });

  it('no reinvita una cuenta ya activada ni una deshabilitada', async () => {
    const f = ficha();
    const t = montar([f]);
    const r = await t.svc.invitar(RECEPCION, f.id, TOKEN);
    t.conClave.add(r.usuarioId!);
    await expect(t.svc.invitar(RECEPCION, f.id, TOKEN)).rejects.toMatchObject({ code: 'CUENTA_YA_ACTIVA', status: 409 });
    t.usuarios.get(r.usuarioId!)!.activo = false;
    await expect(t.svc.invitar(RECEPCION, f.id, TOKEN)).rejects.toMatchObject({ code: 'CUENTA_DESHABILITADA', status: 409 });
  });
});

describe('AccesoPacientesService.estado', () => {
  it('distingue sin cuenta, invitacion pendiente, activa y deshabilitada', async () => {
    const f = ficha();
    const t = montar([f]);
    expect((await t.svc.estado(f.id)).estado).toBe('SIN_CUENTA');
    const r = await t.svc.invitar(RECEPCION, f.id, TOKEN);
    expect(await t.svc.estado(f.id)).toMatchObject({ estado: 'INVITACION_PENDIENTE', usuarioId: r.usuarioId, email: 'ana@x.com' });
    t.conClave.add(r.usuarioId!);
    expect((await t.svc.estado(f.id)).estado).toBe('ACTIVA');
    t.usuarios.get(r.usuarioId!)!.activo = false;
    expect((await t.svc.estado(f.id)).estado).toBe('DESHABILITADA');
  });
});

describe('ayudantes', () => {
  it('usernameDe usa el documento o, si no sirve, el id', () => {
    expect(usernameDe(ficha({ documento: '9.876.543-LP' }))).toBe('p.9.876.543-lp');
    expect(usernameDe(ficha({ id: 'abcdef12-0000-0000-0000-000000000000', documento: '#' }))).toBe('p.abcdef12');
  });

  it('dividirNombre separa nombre y apellido', () => {
    expect(dividirNombre('Ana')).toEqual({ nombre: 'Ana', apellido: '' });
    expect(dividirNombre('Ana Perez')).toEqual({ nombre: 'Ana', apellido: 'Perez' });
    expect(dividirNombre('  Ana  Maria Perez ')).toEqual({ nombre: 'Ana Maria', apellido: 'Perez' });
  });
});
