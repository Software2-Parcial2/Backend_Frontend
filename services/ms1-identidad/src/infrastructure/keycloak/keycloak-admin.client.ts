import type { KeycloakAdminPort } from '../../application/ports.js';
import {
  KeycloakNoDisponibleError,
  ReglaIdentidadError,
  ROLES,
  type CambiosUsuario,
  type EventoAuth,
  type FiltroUsuarios,
  type NuevoUsuario,
  type Rol,
  type Sesion,
  type Usuario,
} from '../../domain/identidad.js';

export interface KeycloakOpciones {
  /** Base de Keycloak, p. ej. http://localhost:8080 */
  url: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  /** Clientes con sesiones de usuario (para listar las del reino). */
  clientesSesion?: string[];
  /** A donde vuelve el paciente al terminar la activacion (cliente y URL de la PWA). */
  invitacion?: { clientId: string; redirectUri: string; vidaSegundos?: number };
  fetchFn?: typeof fetch;
}

interface UsuarioKc {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
  [k: string]: unknown;
}

const ATRIBUTOS = { pacienteId: 'paciente_id', medicoId: 'medico_id', especialidad: 'especialidad', matricula: 'matricula' } as const;

/** Adaptador de la API de administracion de Keycloak con cuenta de servicio (client credentials). */
export class KeycloakAdminClient implements KeycloakAdminPort {
  private readonly f: typeof fetch;
  private readonly timeout: number;
  private token?: { valor: string; expira: number };
  private readonly rolesCache = new Map<string, { id: string; name: string }>();

  constructor(private readonly o: KeycloakOpciones) {
    this.f = o.fetchFn ?? fetch;
    this.timeout = o.timeoutMs ?? 8000;
  }

  // --- usuarios --------------------------------------------------------------------------------------------

  async listarUsuarios(f: FiltroUsuarios, desde: number, limite: number): Promise<Usuario[]> {
    let lista: UsuarioKc[];
    if (f.rol) {
      // Por rol se consulta la lista de miembros; busqueda y estado se filtran aqui (Keycloak no los admite en ese endpoint).
      lista = await this.json<UsuarioKc[]>('GET', `/roles/${encodeURIComponent(f.rol)}/users`, { first: desde, max: limite });
      const q = f.q?.trim().toLowerCase();
      if (q) lista = lista.filter((u) => [u.username, u.email, u.firstName, u.lastName].some((x) => String(x ?? '').toLowerCase().includes(q)));
      if (f.activo !== undefined) lista = lista.filter((u) => (u.enabled ?? true) === f.activo);
    } else {
      lista = await this.json<UsuarioKc[]>('GET', '/users', { first: desde, max: limite, search: f.q?.trim() || undefined, enabled: f.activo, briefRepresentation: false });
    }
    return this.conRoles(lista);
  }

  async obtenerUsuario(id: string): Promise<Usuario | null> {
    const r = await this.pedir('GET', `/users/${encodeURIComponent(id)}`);
    if (r.status === 404) return null;
    this.exigirOk(r, 'obtener el usuario');
    const [u] = await this.conRoles([(await r.json()) as UsuarioKc]);
    return u ?? null;
  }

  async crearUsuario(n: NuevoUsuario): Promise<Usuario> {
    const cuerpo: Record<string, unknown> = {
      username: n.username,
      email: n.email,
      firstName: n.nombre,
      lastName: n.apellido,
      enabled: true,
      emailVerified: false,
      attributes: this.atributos(n),
      ...(n.passwordTemporal
        ? { credentials: [{ type: 'password', value: n.passwordTemporal, temporary: true }], requiredActions: [] }
        : { requiredActions: ['UPDATE_PASSWORD'] }),
    };
    const r = await this.pedir('POST', '/users', undefined, cuerpo);
    if (r.status === 409) throw new ReglaIdentidadError('USUARIO_DUPLICADO', 409, 'Ya existe un usuario con ese nombre de usuario o correo');
    if (r.status === 400) throw new ReglaIdentidadError('DATOS_RECHAZADOS_POR_KEYCLOAK', 422, await this.mensaje(r));
    this.exigirOk(r, 'crear el usuario');
    const id = r.headers.get('location')?.split('/').pop();
    if (!id) throw new KeycloakNoDisponibleError('Keycloak no devolvio el id del usuario creado');
    try {
      await this.asignarRoles(id, n.roles);
    } catch (e) {
      // Un usuario sin rol no sirve y quedaria huerfano: se deshace.
      await this.pedir('DELETE', `/users/${encodeURIComponent(id)}`).catch(() => undefined);
      throw e;
    }
    const u = await this.obtenerUsuario(id);
    if (!u) throw new KeycloakNoDisponibleError('El usuario creado no se pudo leer');
    return u;
  }

  async actualizarUsuario(id: string, c: CambiosUsuario): Promise<Usuario> {
    const actual = await this.usuarioKc(id);
    const attrs = { ...(actual.attributes ?? {}) };
    for (const [campo, nombre] of Object.entries(ATRIBUTOS) as [keyof typeof ATRIBUTOS, string][]) {
      const v = c[campo];
      if (v === undefined) continue;
      if (v === null || v === '') delete attrs[nombre];
      else attrs[nombre] = [v];
    }
    const nuevo: UsuarioKc = {
      ...actual,
      email: c.email ?? actual.email,
      firstName: c.nombre ?? actual.firstName,
      lastName: c.apellido ?? actual.lastName,
      attributes: attrs,
    };
    const r = await this.pedir('PUT', `/users/${encodeURIComponent(id)}`, undefined, nuevo);
    if (r.status === 409) throw new ReglaIdentidadError('USUARIO_DUPLICADO', 409, 'Ya existe un usuario con ese correo');
    if (r.status === 400) throw new ReglaIdentidadError('DATOS_RECHAZADOS_POR_KEYCLOAK', 422, await this.mensaje(r));
    this.exigirOk(r, 'actualizar el usuario');
    return (await this.obtenerUsuario(id))!;
  }

  async habilitar(id: string, activo: boolean): Promise<void> {
    const actual = await this.usuarioKc(id);
    this.exigirOk(await this.pedir('PUT', `/users/${encodeURIComponent(id)}`, undefined, { ...actual, enabled: activo }), 'cambiar el estado del usuario');
  }

  async asignarRoles(id: string, roles: Rol[]): Promise<void> {
    const actuales = await this.json<{ id: string; name: string }[]>('GET', `/users/${encodeURIComponent(id)}/role-mappings/realm`);
    const propios = actuales.filter((r) => (ROLES as readonly string[]).includes(r.name));
    const deseados = await Promise.all(roles.map((r) => this.rol(r)));
    const quitar = propios.filter((r) => !roles.includes(r.name as Rol));
    const poner = deseados.filter((r) => !propios.some((p) => p.name === r.name));
    if (quitar.length) this.exigirOk(await this.pedir('DELETE', `/users/${encodeURIComponent(id)}/role-mappings/realm`, undefined, quitar), 'quitar roles');
    if (poner.length) this.exigirOk(await this.pedir('POST', `/users/${encodeURIComponent(id)}/role-mappings/realm`, undefined, poner), 'asignar roles');
  }

  async contarAdministradoresActivos(): Promise<number> {
    const admins = await this.json<UsuarioKc[]>('GET', '/roles/administrador/users', { first: 0, max: 1000 });
    return admins.filter((u) => u.enabled !== false).length;
  }

  async enviarRecuperacion(id: string): Promise<void> {
    const r = await this.pedir('PUT', `/users/${encodeURIComponent(id)}/execute-actions-email`, undefined, ['UPDATE_PASSWORD']);
    if (r.status === 500) throw new KeycloakNoDisponibleError('Keycloak no pudo enviar el correo (revisa la configuracion SMTP del reino)');
    this.exigirOk(r, 'enviar el correo de recuperacion');
  }

  async enviarInvitacion(id: string): Promise<void> {
    const inv = this.o.invitacion;
    const query = inv ? { lifespan: inv.vidaSegundos ?? 259_200, client_id: inv.clientId, redirect_uri: inv.redirectUri } : { lifespan: 259_200 };
    const r = await this.pedir('PUT', `/users/${encodeURIComponent(id)}/execute-actions-email`, query, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
    if (r.status === 500) throw new KeycloakNoDisponibleError('Keycloak no pudo enviar el correo (revisa la configuracion SMTP del reino)');
    if (r.status === 400) throw new ReglaIdentidadError('INVITACION_RECHAZADA', 422, await this.mensaje(r));
    this.exigirOk(r, 'enviar la invitacion');
  }

  async buscarPorPaciente(pacienteId: string): Promise<Usuario | null> {
    const lista = await this.json<UsuarioKc[]>('GET', '/users', { q: `paciente_id:${pacienteId}`, exact: true, briefRepresentation: false, max: 2 });
    const u = lista.find((x) => x.attributes?.paciente_id?.[0] === pacienteId);
    if (!u) return null;
    const [conRol] = await this.conRoles([u]);
    return conRol ?? null;
  }

  async tieneContrasena(id: string): Promise<boolean> {
    const creds = await this.json<{ type: string }[]>('GET', `/users/${encodeURIComponent(id)}/credentials`);
    return creds.some((c) => c.type === 'password');
  }

  // --- sesiones --------------------------------------------------------------------------------------------

  async sesionesDeUsuario(id: string): Promise<Sesion[]> {
    return (await this.json<SesionKc[]>('GET', `/users/${encodeURIComponent(id)}/sessions`)).map(aSesion);
  }

  async sesionesDelReino(desde: number, limite: number): Promise<Sesion[]> {
    const clientes = await this.json<{ id: string; clientId: string }[]>('GET', '/clients', { first: 0, max: 200 });
    const objetivo = clientes.filter((c) => (this.o.clientesSesion ?? ['sigec-shell', 'sigec-pwa', 'sigec-mobile']).includes(c.clientId));
    const tope = Math.min(desde + limite, 1000);
    const porId = new Map<string, Sesion>();
    for (const c of objetivo) {
      for (const s of await this.json<SesionKc[]>('GET', `/clients/${c.id}/user-sessions`, { first: 0, max: tope })) {
        if (!porId.has(s.id)) porId.set(s.id, aSesion(s));
      }
    }
    return [...porId.values()].sort((a, b) => b.ultimoAcceso.localeCompare(a.ultimoAcceso) || a.id.localeCompare(b.id)).slice(desde, desde + limite);
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    const r = await this.pedir('DELETE', `/sessions/${encodeURIComponent(sesionId)}`);
    if (r.status === 404) throw new ReglaIdentidadError('SESION_NO_ENCONTRADA', 404, `No existe la sesion ${sesionId}`);
    this.exigirOk(r, 'cerrar la sesion');
  }

  async cerrarSesionesDeUsuario(id: string): Promise<void> {
    this.exigirOk(await this.pedir('POST', `/users/${encodeURIComponent(id)}/logout`), 'cerrar las sesiones del usuario');
  }

  async eventos(f: { tipo?: string; usuarioId?: string; desde?: string; hasta?: string }, desde: number, limite: number): Promise<EventoAuth[]> {
    const lista = await this.json<EventoKc[]>('GET', '/events', { type: f.tipo, user: f.usuarioId, dateFrom: f.desde, dateTo: f.hasta, first: desde, max: limite });
    return lista.map((e) => ({
      fecha: new Date(e.time).toISOString(),
      tipo: e.type,
      usuarioId: e.userId ?? null,
      cliente: e.clientId ?? null,
      ip: e.ipAddress ?? null,
      error: e.error ?? null,
    }));
  }

  // --- internos --------------------------------------------------------------------------------------------

  private atributos(n: NuevoUsuario): Record<string, string[]> {
    const a: Record<string, string[]> = {};
    for (const [campo, nombre] of Object.entries(ATRIBUTOS) as [keyof typeof ATRIBUTOS, string][]) {
      const v = n[campo];
      if (v) a[nombre] = [v];
    }
    return a;
  }

  private async usuarioKc(id: string): Promise<UsuarioKc> {
    const r = await this.pedir('GET', `/users/${encodeURIComponent(id)}`);
    if (r.status === 404) throw new ReglaIdentidadError('USUARIO_NO_ENCONTRADO', 404, `No existe el usuario ${id}`);
    this.exigirOk(r, 'leer el usuario');
    return (await r.json()) as UsuarioKc;
  }

  private async rol(nombre: string): Promise<{ id: string; name: string }> {
    const c = this.rolesCache.get(nombre);
    if (c) return c;
    const r = await this.pedir('GET', `/roles/${encodeURIComponent(nombre)}`);
    if (r.status === 404) throw new ReglaIdentidadError('ROL_INVALIDO', 422, `El rol ${nombre} no existe en Keycloak`);
    this.exigirOk(r, 'leer el rol');
    const j = (await r.json()) as { id: string; name: string };
    this.rolesCache.set(nombre, { id: j.id, name: j.name });
    return { id: j.id, name: j.name };
  }

  /** Completa los roles de cada usuario (una llamada por usuario, con concurrencia acotada). */
  private async conRoles(lista: UsuarioKc[]): Promise<Usuario[]> {
    const out: Usuario[] = new Array(lista.length);
    let i = 0;
    const trabajador = async () => {
      while (i < lista.length) {
        const k = i++;
        const u = lista[k]!;
        const roles = await this.json<{ name: string }[]>('GET', `/users/${encodeURIComponent(u.id)}/role-mappings/realm`);
        out[k] = aUsuario(u, roles.map((r) => r.name).filter((n): n is Rol => (ROLES as readonly string[]).includes(n)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, lista.length) }, trabajador));
    return out;
  }

  private async obtenerToken(forzar = false): Promise<string> {
    if (!forzar && this.token && this.token.expira - 30_000 > Date.now()) return this.token.valor;
    let res: Response;
    try {
      res = await this.f(`${this.o.url.replace(/\/$/, '')}/realms/${this.o.realm}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.o.clientId, client_secret: this.o.clientSecret }),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (e) {
      throw new KeycloakNoDisponibleError(`Keycloak no responde: ${(e as Error).message}`);
    }
    if (!res.ok) throw new KeycloakNoDisponibleError(`Keycloak rechazo las credenciales de servicio de ${this.o.clientId} (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { valor: j.access_token, expira: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  private async pedir(metodo: string, ruta: string, query?: Record<string, string | number | boolean | undefined>, cuerpo?: unknown): Promise<Response> {
    const url = new URL(`${this.o.url.replace(/\/$/, '')}/admin/realms/${this.o.realm}${ruta}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const llamar = async (forzar: boolean) =>
      this.f(url, {
        method: metodo,
        headers: { authorization: `Bearer ${await this.obtenerToken(forzar)}`, ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });
    try {
      let r = await llamar(false);
      if (r.status === 401) r = await llamar(true); // token vencido o revocado
      return r;
    } catch (e) {
      if (e instanceof KeycloakNoDisponibleError) throw e;
      throw new KeycloakNoDisponibleError(`Keycloak no responde: ${(e as Error).message}`);
    }
  }

  private async json<T>(metodo: string, ruta: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const r = await this.pedir(metodo, ruta, query);
    this.exigirOk(r, `consultar ${ruta}`);
    return (await r.json()) as T;
  }

  private exigirOk(r: Response, accion: string): void {
    if (r.ok) return;
    if (r.status === 401 || r.status === 403) throw new KeycloakNoDisponibleError(`La cuenta de servicio ${this.o.clientId} no tiene permiso para ${accion} (${r.status})`);
    throw new KeycloakNoDisponibleError(`Keycloak respondio ${r.status} al ${accion}`);
  }

  private async mensaje(r: Response): Promise<string> {
    const j = (await r.json().catch(() => ({}))) as { errorMessage?: string; error?: string };
    return j.errorMessage ?? j.error ?? 'Keycloak rechazo los datos';
  }
}

interface SesionKc {
  id: string;
  username: string;
  userId: string;
  ipAddress?: string;
  start: number;
  lastAccess: number;
  clients?: Record<string, string>;
}
interface EventoKc {
  time: number;
  type: string;
  userId?: string;
  clientId?: string;
  ipAddress?: string;
  error?: string;
}

function aSesion(s: SesionKc): Sesion {
  return {
    id: s.id,
    usuarioId: s.userId,
    username: s.username,
    ip: s.ipAddress ?? null,
    inicio: new Date(s.start).toISOString(),
    ultimoAcceso: new Date(s.lastAccess).toISOString(),
    clientes: Object.values(s.clients ?? {}),
  };
}

function aUsuario(u: UsuarioKc, roles: Rol[]): Usuario {
  const a = (n: string) => u.attributes?.[n]?.[0] ?? null;
  return {
    id: u.id,
    username: u.username,
    email: u.email ?? null,
    nombre: u.firstName ?? null,
    apellido: u.lastName ?? null,
    activo: u.enabled ?? true,
    roles,
    pacienteId: a('paciente_id'),
    medicoId: a('medico_id'),
    especialidad: a('especialidad'),
    matricula: a('matricula'),
    creadoEn: new Date(u.createdTimestamp ?? 0).toISOString(),
  };
}
