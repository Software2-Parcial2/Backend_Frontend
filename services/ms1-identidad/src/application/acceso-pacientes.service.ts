import { Inject, Injectable } from '@nestjs/common';
import { ReglaIdentidadError, type AccesoPaciente, type EstadoAcceso, type FichaPaciente, type InvitacionPaciente, type Usuario } from '../domain/identidad.js';
import { AUDITORIA, KEYCLOAK_ADMIN, PACIENTES, type AuditoriaPort, type KeycloakAdminPort, type PacientesPort } from './ports.js';
import type { Actor } from './usuarios.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

/** Usuario a partir del documento (el paciente entra con su correo; el usuario solo tiene que ser unico y valido). */
export function usernameDe(ficha: FichaPaciente): string {
  const doc = ficha.documento.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const candidato = `p.${doc}`.slice(0, 50);
  return USERNAME.test(candidato) && doc.length >= 3 ? candidato : `p.${ficha.id.slice(0, 8)}`;
}

/** "Ana Maria Perez Lopez" -> nombre "Ana Maria", apellido "Perez Lopez" (MS2 guarda el nombre completo en un solo campo). */
export function dividirNombre(completo: string): { nombre: string; apellido: string } {
  const p = completo.trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return { nombre: p[0] ?? '', apellido: '' };
  if (p.length === 2) return { nombre: p[0]!, apellido: p[1]! };
  const corte = Math.ceil(p.length / 2);
  return { nombre: p.slice(0, corte).join(' '), apellido: p.slice(corte).join(' ') };
}

/**
 * Acceso al portal de un paciente de MS2: recepcion lo invita y el paciente define su contrasena desde el correo.
 * El nombre y el correo salen de la ficha de MS2 (no del cliente) y la cuenta solo puede tener el rol `paciente`.
 */
@Injectable()
export class AccesoPacientesService {
  constructor(
    @Inject(KEYCLOAK_ADMIN) private readonly kc: KeycloakAdminPort,
    @Inject(PACIENTES) private readonly pacientes: PacientesPort,
    @Inject(AUDITORIA) private readonly auditoria: AuditoriaPort,
  ) {}

  async estado(pacienteId: string): Promise<AccesoPaciente> {
    this.exigirUuid(pacienteId);
    const u = await this.kc.buscarPorPaciente(pacienteId);
    return this.acceso(pacienteId, u, u ? await this.estadoDe(u) : 'SIN_CUENTA');
  }

  /**
   * Crea la cuenta (si no existe) y envia el correo de activacion. Repetirlo reenvia la invitacion mientras el paciente no la
   * haya usado; si ya activo su cuenta responde 409 (que use "Olvide mi contrasena").
   */
  async invitar(actor: Actor, pacienteId: string, autorizacion: string): Promise<InvitacionPaciente> {
    this.exigirUuid(pacienteId);
    const ficha = await this.pacientes.obtener(pacienteId, autorizacion);
    if (!ficha) throw new ReglaIdentidadError('PACIENTE_NO_ENCONTRADO', 404, `No existe el paciente ${pacienteId}`);
    if (!ficha.email) throw new ReglaIdentidadError('SIN_CORREO', 422, 'La ficha del paciente no tiene correo: agreguelo para enviarle la invitacion');

    let u = await this.kc.buscarPorPaciente(pacienteId);
    let creada = false;
    if (u) {
      const estado = await this.estadoDe(u);
      if (estado === 'DESHABILITADA') throw new ReglaIdentidadError('CUENTA_DESHABILITADA', 409, 'La cuenta del paciente esta deshabilitada: un administrador debe habilitarla');
      if (estado === 'ACTIVA') throw new ReglaIdentidadError('CUENTA_YA_ACTIVA', 409, 'El paciente ya activo su cuenta; si olvido la contrasena puede usar "Olvide mi contrasena"');
      // Si recepcion corrigio el correo en la ficha, la invitacion va al correo nuevo.
      if (u.email !== ficha.email) u = await this.kc.actualizarUsuario(u.id, { email: ficha.email });
    } else {
      const { nombre, apellido } = dividirNombre(ficha.nombre);
      u = await this.kc.crearUsuario({ username: usernameDe(ficha), email: ficha.email, nombre, apellido, roles: ['paciente'], pacienteId });
      creada = true;
      this.auditoria.registrar({ actor: actor.sub, accion: 'USUARIO_CREADO', objetivo: u.id, detalle: `${u.username} [paciente] por invitacion` });
    }

    try {
      await this.kc.enviarInvitacion(u.id);
    } catch (e) {
      // La cuenta ya existe: se informa que el correo no salio para reintentar luego (p. ej. Keycloak sin SMTP).
      if (!creada) throw e;
      return { ...this.acceso(pacienteId, u, 'INVITACION_PENDIENTE'), creada, enviada: false, detalle: (e as Error).message };
    }
    this.auditoria.registrar({ actor: actor.sub, accion: 'INVITACION_ENVIADA', objetivo: u.id, detalle: ficha.email });
    return { ...this.acceso(pacienteId, u, 'INVITACION_PENDIENTE'), creada, enviada: true, detalle: null };
  }

  private async estadoDe(u: Usuario): Promise<EstadoAcceso> {
    if (!u.activo) return 'DESHABILITADA';
    return (await this.kc.tieneContrasena(u.id)) ? 'ACTIVA' : 'INVITACION_PENDIENTE';
  }

  private acceso(pacienteId: string, u: Usuario | null, estado: EstadoAcceso): AccesoPaciente {
    return { pacienteId, estado, usuarioId: u?.id ?? null, username: u?.username ?? null, email: u?.email ?? null };
  }

  private exigirUuid(id: string): void {
    if (!UUID.test(id)) throw new ReglaIdentidadError('VINCULO_INVALIDO', 422, 'pacienteId debe ser un UUID');
  }
}
