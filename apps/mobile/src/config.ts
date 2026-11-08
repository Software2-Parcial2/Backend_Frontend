/**
 * Direcciones del API y del login. Se cambian al arrancar con EXPO_PUBLIC_API_URL / EXPO_PUBLIC_KEYCLOAK_URL.
 * En el emulador de Android `localhost` es el propio emulador: use http://10.0.2.2:8090 y http://10.0.2.2:8080 (el issuer de Keycloak
 * visible desde el dispositivo debe ser el mismo que ven los servicios: ver docs/frontends-conexion.md).
 */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8090';
export const KEYCLOAK_URL: string = process.env.EXPO_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080';
export const OIDC = {
  issuer: `${KEYCLOAK_URL}/realms/sigec`,
  clientId: 'sigec-mobile',
  redirectUrl: 'sigec://callback',
  scopes: ['openid', 'profile', 'email', 'offline_access'],
  usePKCE: true,
  dangerouslyAllowInsecureHttpRequests: __DEV__, // solo desarrollo local
} as const;
