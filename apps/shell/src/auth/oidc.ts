import type { AuthProviderProps } from 'react-oidc-context';

/** Keycloak: realm sigec, cliente publico sigec-shell con PKCE (code + S256). */
export const oidcConfig: AuthProviderProps = {
  authority: 'http://localhost:8080/realms/sigec',
  client_id: 'sigec-shell',
  redirect_uri: 'http://localhost:5173/',
  post_logout_redirect_uri: 'http://localhost:5173/',
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
};
