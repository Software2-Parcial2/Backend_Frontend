/// Direcciones del API y del login. Se cambian al compilar con
/// `--dart-define=API_URL=... --dart-define=KEYCLOAK_URL=...`.
/// En el emulador de Android `localhost` es el propio emulador: se usa 10.0.2.2 (el issuer de Keycloak visible
/// desde el dispositivo debe ser el mismo que ven los servicios: ver docs/frontends-conexion.md).
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://192.168.0.137:8090',
);
const keycloakUrl = String.fromEnvironment(
  'KEYCLOAK_URL',
  defaultValue: 'http://192.168.0.137:8080',
);

const oidcIssuer = '$keycloakUrl/realms/sigec';
const oidcClientId = 'sigec-mobile';
const oidcRedirectUrl = 'sigec://callback';
const oidcScopes = ['openid', 'profile', 'email'];
