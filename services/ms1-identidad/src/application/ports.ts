import type { Auditoria, CambiosUsuario, EventoAuth, FiltroUsuarios, NuevoUsuario, Rol, Sesion, Usuario } from '../domain/identidad.js';

export const KEYCLOAK_ADMIN = Symbol('KEYCLOAK_ADMIN');
export const AUDITORIA = Symbol('AUDITORIA');
export const SONDAS = Symbol('SONDAS');

/** Puerto de salida: la API de administracion de Keycloak. Cada metodo lanza ReglaIdentidadError (404/409) o KeycloakNoDisponibleError. */
export interface KeycloakAdminPort {
  listarUsuarios(f: FiltroUsuarios, desde: number, limite: number): Promise<Usuario[]>;
  obtenerUsuario(id: string): Promise<Usuario | null>;
  /** @throws ReglaIdentidadError USUARIO_DUPLICADO (409) si el username o el correo ya existen */
  crearUsuario(u: NuevoUsuario): Promise<Usuario>;
  actualizarUsuario(id: string, c: CambiosUsuario): Promise<Usuario>;
  habilitar(id: string, activo: boolean): Promise<void>;
  asignarRoles(id: string, roles: Rol[]): Promise<void>;
  /** Cuantos administradores activos hay (para no dejar el sistema sin ninguno). */
  contarAdministradoresActivos(): Promise<number>;
  /** Envia al usuario un correo para definir una contrasena nueva. */
  enviarRecuperacion(id: string): Promise<void>;
  sesionesDeUsuario(id: string): Promise<Sesion[]>;
  sesionesDelReino(desde: number, limite: number): Promise<Sesion[]>;
  cerrarSesion(sesionId: string): Promise<void>;
  cerrarSesionesDeUsuario(id: string): Promise<void>;
  eventos(f: { tipo?: string; usuarioId?: string; desde?: string; hasta?: string }, desde: number, limite: number): Promise<EventoAuth[]>;
}

export interface AuditoriaPort {
  registrar(a: Omit<Auditoria, 'en'>): void;
  recientes(limite: number): Auditoria[];
}

/** Una comprobacion de salud de un componente de la pila. */
export interface Sonda {
  nombre: string;
  url: string;
}

export interface SondaPort {
  comprobar(s: Sonda, timeoutMs: number): Promise<{ ok: boolean; ms: number; detalle: string | null }>;
}
