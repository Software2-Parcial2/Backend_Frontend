import { iniciales } from '@sigec/api-client';

/** Usuario tal como lo devuelve ms1-identidad (contracts/openapi/ms1-identidad.json). */
export interface UsuarioApi {
  id: string;
  username: string;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
  activo: boolean;
  roles: string[];
  pacienteId: string | null;
  medicoId: string | null;
  especialidad: string | null;
  matricula: string | null;
  creadoEn: string;
  /** Solo al crear sin contrasena temporal: si salio el correo de activacion. */
  invitacion?: { enviada: boolean; detalle: string | null };
}

export interface SesionApi {
  id: string;
  usuarioId: string;
  username: string;
  ip: string | null;
  inicio: string;
  ultimoAcceso: string;
  clientes: string[];
}

export interface Pagina<T> { items: T[]; siguiente: string | null }

/** Roles de Keycloak con su nombre en pantalla y lo que permiten (segun los @Roles/@PreAuthorize de los servicios). */
export const ROLES: { clave: string; etiqueta: string }[] = [
  { clave: 'recepcion', etiqueta: 'Recepción' },
  { clave: 'medico', etiqueta: 'Médico' },
  { clave: 'caja', etiqueta: 'Cajero' },
  { clave: 'administrador', etiqueta: 'Administrador' },
  { clave: 'paciente', etiqueta: 'Paciente' },
];
export const etiquetaRol = (clave: string) => ROLES.find((r) => r.clave === clave)?.etiqueta ?? clave;

export const PERMISOS: Record<string, [string, boolean][]> = {
  recepcion: [['Registrar y buscar pacientes', true], ['Reservar y reprogramar citas', true], ['Ver historia clínica', false], ['Registrar cobros', false]],
  medico: [['Registrar y buscar pacientes', true], ['Reservar y reprogramar citas', false], ['Ver historia clínica', true], ['Registrar cobros', false]],
  caja: [['Registrar y buscar pacientes', false], ['Reservar y reprogramar citas', false], ['Ver historia clínica', false], ['Registrar cobros', true]],
  administrador: [['Registrar y buscar pacientes', true], ['Reservar y reprogramar citas', true], ['Ver historia clínica', false], ['Registrar cobros', true]],
  paciente: [['Registrar y buscar pacientes', false], ['Reservar y reprogramar citas', true], ['Ver historia clínica', true], ['Registrar cobros', false]],
};

export const nombreCompleto = (u: Pick<UsuarioApi, 'nombre' | 'apellido' | 'username'>) =>
  [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || u.username;
export const inicialesDe = (u: Pick<UsuarioApi, 'nombre' | 'apellido' | 'username'>) => iniciales(nombreCompleto(u));
export const rolPrincipal = (u: Pick<UsuarioApi, 'roles'>) => u.roles[0] ?? '';
