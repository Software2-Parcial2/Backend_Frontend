# Frontends conectados a las APIs

Todas las pantallas leen y escriben contra el gateway (`:8090`). Cliente comun: `packages/api-client` (TypeScript sin dependencias).

## Direcciones
| App | Variable | Por defecto |
|---|---|---|
| Shell (Rsbuild) | `PUBLIC_API_URL` → la entrega a los remotos como `apiUrl` en `mount()` | `http://localhost:8090` |
| PWA y Vue en modo independiente (Vite) | `VITE_API_URL`, `VITE_KEYCLOAK_URL` (PWA) | `:8090`, `:8080` |
| Movil (Expo) | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_KEYCLOAK_URL` | `:8090`, `:8080` (emulador Android: `10.0.2.2`) |

El token se lee **en cada peticion** del contexto del shell (evento `sigec:token-refreshed`) o de la sesion de la app; nunca se copia.

## Reglas del cliente
`application/problem+json` → `ApiError` (`code`, `errores[]`, `correlationId`, `versionVigente`; estado 0 = sin conexion) · listas `{items, siguiente}` (`pagina`, `todas`) ·
`Idempotency-Key` en POST/PUT/PATCH (la MISMA al reintentar el mismo envio: `nuevaIntencion()`) · `If-Match` con la version · 401 → renovar token y repetir una vez ·
`X-Correlation-Id` por peticion · 202 de la SAGA → `esperarCita()` · dinero como texto (`"180.00"`) y fechas UTC mostradas en America/La_Paz.

## Verificar en navegador real
1. Pila: `docker compose up -d` (si el 5432 esta ocupado: `POSTGRES_HOST_PORT=5440`), `make dynamodb-init rabbitmq-declare mongo-init keycloak-aplicar seed`, `make n8n-import` si se recreo n8n, `scripts/dev-services.sh start gateway ms1 ms2 ms3 ms4 ms5 ms6 ms7 ms8 ms5-inference ms7-ml ms7-embeddings`, `poller-start`, `workers-start`. Variables utiles: `NOTIF_SENDER=simulated LLM_PROVIDER=simulated` (sin Mailtrap ni API de LLM) y, con Postgres en 5440, `POSTGRES_PORT=5440 DB_PORT=5440 DB_URL=jdbc:postgresql://localhost:5440/<base>` para ms2/ms4.
2. Frontends: shell `cd apps/shell && npx rsbuild dev` (`:5173`), Angular `cd apps/remote-angular && pnpm build && npx vite preview` (`:4201`), Vue `cd apps/remote-vue && pnpm build && npx vite preview --port 5175`, PWA `cd apps/pwa-paciente && pnpm build && npx vite preview` (`:5174`).
3. `(set -a; source .env; set +a; node scripts/e2e-frontends/index.mjs [shell|angular|vue|pwa])`. `SOLO=historias node scripts/e2e-frontends/index.mjs angular` corre un modulo. Cada escenario inicia sesion con Keycloak, recorre las pantallas con los datos sembrados, comprueba el estado en el backend por la API y falla ante cualquier `console.error` o HTTP inesperado.
4. Backend: `scripts/e2e-flujos.sh` (88 comprobaciones).

Usuarios de prueba (`Sigec123!`): `administrador`, `recepcion`, `medico`, `caja`, `paciente`. El usuario `medico` del realm **no** lleva el claim `medico_id`: los escenarios que crean consultas o estudios crean un medico temporal con `crearMedicoDePrueba()` (via ms1) y lo borran al terminar.
