import type { AuthProviderProps } from 'react-oidc-context'

/** Keycloak del realm sigec (VITE_KEYCLOAK_URL cambia el servidor al compilar). Cliente publico sigec-pwa con PKCE (code + S256). */
const KEYCLOAK = (import.meta.env.VITE_KEYCLOAK_URL as string | undefined) ?? 'http://localhost:8080'
const ORIGEN = typeof window === 'undefined' ? 'http://localhost:5174' : window.location.origin

export const oidcConfig: AuthProviderProps = {
  authority: `${KEYCLOAK}/realms/sigec`,
  client_id: 'sigec-pwa',
  redirect_uri: `${ORIGEN}/`,
  post_logout_redirect_uri: `${ORIGEN}/`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  // Tras el login se limpia ?code=&state= de la URL.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}
