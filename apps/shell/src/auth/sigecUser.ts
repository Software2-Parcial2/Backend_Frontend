import type { MfeContext, MfeUser } from '@sigec/mfe-contract';
import type { User } from 'oidc-client-ts';

/** Lee el payload del JWT (sin verificar: la verificacion la hacen los servicios). */
function decodePayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function rolesFromToken(token: string): string[] {
  const realmAccess = decodePayload(token).realm_access as { roles?: string[] } | undefined;
  return realmAccess?.roles ?? [];
}

export function toMfeUser(user: User): MfeUser {
  return {
    sub: user.profile.sub,
    username: user.profile.preferred_username,
    email: user.profile.email,
    roles: rolesFromToken(user.access_token),
  };
}

export function toMfeContext(user: User): MfeContext {
  const mfeUser = toMfeUser(user);
  return { token: user.access_token, user: mfeUser, roles: mfeUser.roles };
}
