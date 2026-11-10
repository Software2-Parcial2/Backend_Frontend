/** Modelo de identidad (sin dependencias de frameworks). */

export const ROLES = ['administrador', 'medico', 'recepcion', 'caja', 'paciente'] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  id: string;
  username: string;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
  activo: boolean;
  roles: Rol[];
  /** Vinculo con MS2 (claim `paciente_id`). */
  pacienteId: string | null;
  /** Vinculo con el catalogo de medicos de MS2 (claim `medico_id`). */
  medicoId: string | null;
  especialidad: string | null;
  matricula: string | null;
  creadoEn: string;
}

export interface NuevoUsuario {
  username: string;
  email: string;
  nombre: string;
  apellido: string;
  roles: Rol[];
  pacienteId?: string;
  medicoId?: string;
  especialidad?: string;
  matricula?: string;
  /** Si se indica es temporal: el usuario debe cambiarla al entrar. Si no, recibe un correo para definirla. */
  passwordTemporal?: string;
}

/** Estado del acceso al portal de un paciente de MS2. */
export type EstadoAcceso = 'SIN_CUENTA' | 'INVITACION_PENDIENTE' | 'ACTIVA' | 'DESHABILITADA';

export interface AccesoPaciente {
  pacienteId: string;
  estado: EstadoAcceso;
  usuarioId: string | null;
  username: string | null;
  email: string | null;
}

/** Resultado de invitar a un paciente: el acceso y si el correo salio (si Keycloak no tiene SMTP, la cuenta queda creada igual). */
export interface InvitacionPaciente extends AccesoPaciente {
  creada: boolean;
  enviada: boolean;
  detalle: string | null;
}

/** Lo que MS1 necesita de la ficha de MS2. */
export interface FichaPaciente {
  id: string;
  nombre: string;
  documento: string;
  email: string | null;
}

export interface CambiosUsuario {
  email?: string;
  nombre?: string;
  apellido?: string;
  pacienteId?: string | null;
  medicoId?: string | null;
  especialidad?: string | null;
  matricula?: string | null;
}

export interface Sesion {
  id: string;
  usuarioId: string;
  username: string;
  ip: string | null;
  inicio: string;
  ultimoAcceso: string;
  clientes: string[];
}

export interface EventoAuth {
  fecha: string;
  tipo: string;
  usuarioId: string | null;
  cliente: string | null;
  ip: string | null;
  error: string | null;
}

export interface FiltroUsuarios {
  q?: string;
  rol?: Rol;
  activo?: boolean;
}

export interface PaginaOffset<T> {
  items: T[];
  siguiente: string | null;
}

export type EstadoServicio = 'OK' | 'CAIDO';

export interface ServicioSalud {
  nombre: string;
  estado: EstadoServicio;
  /** Milisegundos que tardo en responder. */
  ms: number;
  detalle: string | null;
}

export interface Salud {
  estado: 'OK' | 'DEGRADADO' | 'CAIDO';
  verificadoEn: string;
  servicios: ServicioSalud[];
}

export interface Auditoria {
  en: string;
  /** sub de Keycloak de quien hizo el cambio. */
  actor: string;
  accion: string;
  objetivo: string;
  detalle?: string;
}

/** Errores de regla de negocio con codigo estable. */
export class ReglaIdentidadError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

/** Keycloak no responde o rechazo a la cuenta de servicio. */
export class KeycloakNoDisponibleError extends Error {}

/** MS2 no respondio (o rechazo la consulta de la ficha). */
export class PacientesNoDisponibleError extends Error {}
