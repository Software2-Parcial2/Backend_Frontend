/** Usuario autenticado, construido a partir de las claims del JWT de Keycloak. */
export interface AuthUser {
  sub: string;
  username?: string;
  email?: string;
  /** Roles de realm (claim realm_access.roles): administrador, medico, recepcion, caja, paciente. */
  roles: string[];
  /** Paciente vinculado al usuario (claim `paciente_id`); solo lo tiene el rol paciente. */
  pacienteId?: string;
}

export interface AuthOptions {
  /** Issuer esperado del token. Por defecto KEYCLOAK_ISSUER o el realm sigec local. */
  issuer: string;
  /** URL del JWKS. Por defecto KEYCLOAK_JWKS_URL o `${issuer}/protocol/openid-connect/certs`. */
  jwksUri: string;
}

export const DEFAULT_ISSUER = 'http://localhost:8080/realms/sigec';
