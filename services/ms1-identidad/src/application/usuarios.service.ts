import { Inject, Injectable } from '@nestjs/common';
import { codificarCursor, decodificarCursor } from '@sigec/http-nest';
import {
  ReglaIdentidadError,
  ROLES,
  type CambiosUsuario,
  type EventoAuth,
  type FiltroUsuarios,
  type NuevoUsuario,
  type PaginaOffset,
  type Rol,
  type Sesion,
  type Usuario,
} from '../domain/identidad.js';
import { AUDITORIA, KEYCLOAK_ADMIN, type AuditoriaPort, type KeycloakAdminPort } from './ports.js';

export interface Actor {
  sub: string;
  username: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export interface VinculosUsuario {
  pacienteId?: string;
  medicoId?: string;
  especialidad?: string;
  matricula?: string;
}

export class CursorInvalidoError extends Error {}

function desdeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const k = decodificarCursor<{ o: unknown }>(cursor);
  if (!k || !Number.isInteger(k.o) || (k.o as number) < 0 || (k.o as number) > 1_000_000) throw new CursorInvalidoError('cursor invalido');
  return k.o as number;
}

/** Pagina por desplazamiento: se pide uno de mas para saber si hay siguiente. */
async function paginar<T>(desde: number, limite: number, leer: (desde: number, max: number) => Promise<T[]>): Promise<PaginaOffset<T>> {
  const filas = await leer(desde, limite + 1);
  return { items: filas.slice(0, limite), siguiente: filas.length > limite ? codificarCursor({ o: desde + limite }) : null };
}

/** Casos de uso de usuarios, roles y sesiones. Las reglas de seguridad viven aqui, no en Keycloak ni en el controlador. */
@Injectable()
export class UsuariosService {
  constructor(
    @Inject(KEYCLOAK_ADMIN) private readonly kc: KeycloakAdminPort,
    @Inject(AUDITORIA) private readonly auditoria: AuditoriaPort,
  ) {}

  async listar(f: FiltroUsuarios, limite: number, cursor?: string): Promise<PaginaOffset<Usuario>> {
    return paginar(desdeCursor(cursor), Math.min(Math.max(limite, 1), 100), (d, m) => this.kc.listarUsuarios(f, d, m));
  }

  async obtener(id: string): Promise<Usuario> {
    const u = await this.kc.obtenerUsuario(id);
    if (!u) throw new ReglaIdentidadError('USUARIO_NO_ENCONTRADO', 404, `No existe el usuario ${id}`);
    return u;
  }

  async crear(actor: Actor, n: NuevoUsuario): Promise<Usuario> {
    const username = n.username.trim().toLowerCase();
    if (!USERNAME.test(username)) throw new ReglaIdentidadError('USERNAME_INVALIDO', 422, 'El usuario debe tener 3 a 50 caracteres: letras minusculas, numeros, punto, guion o guion bajo');
    this.validarVinculos(n.roles, n);
    if (n.passwordTemporal !== undefined && n.passwordTemporal.length < 8) throw new ReglaIdentidadError('PASSWORD_DEBIL', 422, 'La contrasena temporal debe tener al menos 8 caracteres');
    const creado = await this.kc.crearUsuario({ ...n, username, roles: [...new Set(n.roles)] });
    this.auditoria.registrar({ actor: actor.sub, accion: 'USUARIO_CREADO', objetivo: creado.id, detalle: `${username} [${creado.roles.join(',')}]` });
    return creado;
  }

  async actualizar(actor: Actor, id: string, c: CambiosUsuario): Promise<Usuario> {
    const actual = await this.obtener(id);
    const roles = actual.roles;
    this.validarVinculos(roles, {
      pacienteId: c.pacienteId === undefined ? (actual.pacienteId ?? undefined) : (c.pacienteId ?? undefined),
      medicoId: c.medicoId === undefined ? (actual.medicoId ?? undefined) : (c.medicoId ?? undefined),
      especialidad: c.especialidad === undefined ? (actual.especialidad ?? undefined) : (c.especialidad ?? undefined),
      matricula: c.matricula === undefined ? (actual.matricula ?? undefined) : (c.matricula ?? undefined),
    });
    const u = await this.kc.actualizarUsuario(id, c);
    this.auditoria.registrar({ actor: actor.sub, accion: 'USUARIO_ACTUALIZADO', objetivo: id, detalle: Object.keys(c).join(',') });
    return u;
  }

  async habilitar(actor: Actor, id: string, activo: boolean): Promise<Usuario> {
    const actual = await this.obtener(id);
    if (!activo) {
      if (id === actor.sub) throw new ReglaIdentidadError('AUTOPROTECCION', 409, 'No puedes deshabilitar tu propia cuenta');
      await this.exigirAdministradorRestante(actual);
    }
    if (actual.activo === activo) return actual;
    await this.kc.habilitar(id, activo);
    if (!activo) await this.kc.cerrarSesionesDeUsuario(id); // un usuario deshabilitado no conserva sesiones abiertas
    this.auditoria.registrar({ actor: actor.sub, accion: activo ? 'USUARIO_HABILITADO' : 'USUARIO_DESHABILITADO', objetivo: id });
    return { ...actual, activo };
  }

  /**
   * Reemplaza los roles. Los vinculos que ya no corresponden (p. ej. los datos de medico al dejar de serlo) se limpian, y los
   * que el nuevo rol exige (pacienteId) deben venir en la peticion o estar ya guardados.
   */
  async cambiarRoles(actor: Actor, id: string, roles: Rol[], vinculos: VinculosUsuario = {}): Promise<Usuario> {
    const actual = await this.obtener(id);
    const nuevos = [...new Set(roles)];
    if (nuevos.length === 0 || nuevos.some((r) => !ROLES.includes(r))) throw new ReglaIdentidadError('ROL_INVALIDO', 422, `roles debe ser un subconjunto no vacio de: ${ROLES.join(', ')}`);
    const esPaciente = nuevos.includes('paciente');
    const esMedico = nuevos.includes('medico');
    const v: VinculosUsuario = {
      pacienteId: esPaciente ? (vinculos.pacienteId ?? actual.pacienteId ?? undefined) : undefined,
      medicoId: esMedico ? (vinculos.medicoId ?? actual.medicoId ?? undefined) : undefined,
      especialidad: esMedico ? (vinculos.especialidad ?? actual.especialidad ?? undefined) : undefined,
      matricula: esMedico ? (vinculos.matricula ?? actual.matricula ?? undefined) : undefined,
    };
    this.validarVinculos(nuevos, v);
    if (actual.roles.includes('administrador') && !nuevos.includes('administrador')) {
      if (id === actor.sub) throw new ReglaIdentidadError('AUTOPROTECCION', 409, 'No puedes quitarte el rol administrador');
      await this.exigirAdministradorRestante(actual);
    }
    await this.kc.asignarRoles(id, nuevos);
    const cambios: CambiosUsuario = {};
    for (const campo of ['pacienteId', 'medicoId', 'especialidad', 'matricula'] as const) {
      if ((v[campo] ?? null) !== (actual[campo] ?? null)) cambios[campo] = v[campo] ?? null;
    }
    if (Object.keys(cambios).length) await this.kc.actualizarUsuario(id, cambios);
    // Los permisos viajan en el token: se cierran las sesiones para que el cambio se aplique al volver a entrar.
    await this.kc.cerrarSesionesDeUsuario(id);
    this.auditoria.registrar({ actor: actor.sub, accion: 'ROLES_CAMBIADOS', objetivo: id, detalle: `${actual.roles.join(',')} -> ${nuevos.join(',')}` });
    return { ...actual, roles: nuevos, pacienteId: v.pacienteId ?? null, medicoId: v.medicoId ?? null, especialidad: v.especialidad ?? null, matricula: v.matricula ?? null };
  }

  async recuperar(actor: Actor, id: string): Promise<{ enviadoA: string }> {
    const u = await this.obtener(id);
    if (!u.email) throw new ReglaIdentidadError('SIN_CORREO', 422, 'El usuario no tiene correo para enviarle el enlace');
    await this.kc.enviarRecuperacion(id);
    this.auditoria.registrar({ actor: actor.sub, accion: 'RECUPERACION_ENVIADA', objetivo: id });
    return { enviadoA: u.email };
  }

  async sesionesDeUsuario(id: string): Promise<Sesion[]> {
    await this.obtener(id);
    return this.kc.sesionesDeUsuario(id);
  }

  async sesiones(limite: number, cursor?: string): Promise<PaginaOffset<Sesion>> {
    return paginar(desdeCursor(cursor), Math.min(Math.max(limite, 1), 100), (d, m) => this.kc.sesionesDelReino(d, m));
  }

  async cerrarSesion(actor: Actor, sesionId: string): Promise<void> {
    await this.kc.cerrarSesion(sesionId);
    this.auditoria.registrar({ actor: actor.sub, accion: 'SESION_CERRADA', objetivo: sesionId });
  }

  async revocarSesiones(actor: Actor, id: string): Promise<void> {
    await this.obtener(id);
    await this.kc.cerrarSesionesDeUsuario(id);
    this.auditoria.registrar({ actor: actor.sub, accion: 'SESIONES_REVOCADAS', objetivo: id });
  }

  async eventos(f: { tipo?: string; usuarioId?: string; desde?: string; hasta?: string }, limite: number, cursor?: string): Promise<PaginaOffset<EventoAuth>> {
    return paginar(desdeCursor(cursor), Math.min(Math.max(limite, 1), 100), (d, m) => this.kc.eventos(f, d, m));
  }

  auditoriaReciente(limite: number) {
    return this.auditoria.recientes(Math.min(Math.max(limite, 1), 200));
  }

  // --- reglas ----------------------------------------------------------------------------------------------

  /** Nunca se deja al sistema sin un administrador activo. */
  private async exigirAdministradorRestante(u: Usuario): Promise<void> {
    if (!u.roles.includes('administrador') || !u.activo) return;
    if ((await this.kc.contarAdministradoresActivos()) <= 1) {
      throw new ReglaIdentidadError('ULTIMO_ADMINISTRADOR', 409, 'Es el unico administrador activo: crea o habilita otro antes de continuar');
    }
  }

  /** Coherencia entre roles y vinculos: el paciente se liga a MS2 y es solo paciente; los datos de medico solo van con ese rol. */
  private validarVinculos(roles: Rol[], v: VinculosUsuario): void {
    if (roles.length === 0 || roles.some((r) => !ROLES.includes(r))) throw new ReglaIdentidadError('ROL_INVALIDO', 422, `roles debe ser un subconjunto no vacio de: ${ROLES.join(', ')}`);
    const esPaciente = roles.includes('paciente');
    if (esPaciente && roles.length > 1) throw new ReglaIdentidadError('ROLES_INCOMPATIBLES', 422, 'Un paciente no puede tener roles de personal');
    if (esPaciente && !v.pacienteId) throw new ReglaIdentidadError('PACIENTE_REQUERIDO', 422, 'El rol paciente exige pacienteId (el paciente de MS2 al que se vincula)');
    if (v.pacienteId && !esPaciente) throw new ReglaIdentidadError('VINCULO_INVALIDO', 422, 'pacienteId solo corresponde al rol paciente');
    if (v.pacienteId && !UUID.test(v.pacienteId)) throw new ReglaIdentidadError('VINCULO_INVALIDO', 422, 'pacienteId debe ser un UUID');
    if (v.medicoId && !UUID.test(v.medicoId)) throw new ReglaIdentidadError('VINCULO_INVALIDO', 422, 'medicoId debe ser un UUID');
    if ((v.medicoId || v.especialidad || v.matricula) && !roles.includes('medico')) throw new ReglaIdentidadError('VINCULO_INVALIDO', 422, 'medicoId, especialidad y matricula solo corresponden al rol medico');
  }
}
