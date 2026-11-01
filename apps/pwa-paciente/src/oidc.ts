import type { AuthProviderProps } from 'react-oidc-context'

/** Keycloak: realm sigec, cliente publico sigec-pwa con PKCE (code + S256). */
export const oidcConfig: AuthProviderProps = {
  authority: 'http://localhost:8080/realms/sigec',
  client_id: 'sigec-pwa',
  redirect_uri: 'http://localhost:5174/',
  post_logout_redirect_uri: 'http://localhost:5174/',
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  // Tras el login se limpia ?code=&state= de la URL.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}
