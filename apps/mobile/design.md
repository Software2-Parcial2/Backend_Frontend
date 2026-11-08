# design.md · app movil (Expo / React Native)

Actor: paciente. Cliente aparte, sin Module Federation. Sistema visual: `packages/design-tokens/design.md`; aqui se traduce a `StyleSheet`.

## Tokens
`src/theme.ts` es una **copia** de `packages/design-tokens/tokens.js` (esta app usa npm, no el workspace de pnpm, asi que no puede importar el paquete).
Si cambias un valor, cambialo en los tres sitios: `sigec.css`, `tokens.js` y `theme.ts`. Fuente: la del sistema; Public Sans / IBM Plex Mono quedan para cuando se agregue `expo-font`.

## Componentes (`src/ui.tsx`)
`Chip` (punto + texto, `.chip`) · `Card` (`.mc`, 14 px de radio) · `Boton` (52 px, `.mbtn`: normal/pri/peligro/claro) · `Aviso` (`.banner`) ·
`Fila` (`.li`) · `Interruptor` (`Switch` nativo) · `Barra` (`.mt`, con volver). Objetivos tactiles >= 44 px; todo control es `Pressable` con `accessibilityRole`.

## Pantallas (`src/screens.tsx`, navegacion por pila en `App.tsx`; `Nav.arg` lleva el id de la cita)
| Diseno | Pantalla | Datos |
|---|---|---|
| mov-login | `Login` | OIDC + PKCE con `react-native-app-auth` (cliente `sigec-mobile`, `sigec://callback`); solo el refresh token se guarda (SecureStore) |
| mov-inicio | `Inicio` | `GET /api/citas?pacienteId` + cola local; copia en SQLite si no hay red |
| mov-detalle | `Detalle` | `GET /api/citas/{id}`, cargo, reprogramar y cancelar |
| mov-solicitar | `Solicitar` | especialidades, medicos y disponibilidad reales; guarda en la cola (SQLite) con su `Idempotency-Key`; con `arg` reprograma |
| mov-pendiente | `Pendiente` | la cola: Pendiente / Enviando / Confirmando / Confirmada / Conflicto / Caducada |
| mov-confirmada | `Confirmada` | `GET /api/citas/{id}` |
| mov-notificaciones | `Avisos` | `GET /api/notificaciones`, marcar leidos |
| mov-perfil | `Perfil` | `/api/pacientes/me` y canales de aviso (`PUT /api/notificaciones/preferencias/{id}`) |
| mov-estudio | `Estudio` | informes validados (`/api/imagenes`); **subir** una imagen del telefono falta (no hay `expo-image-picker` ni validador TFLite local) |
| mov-estudio-rechazado | — | se elimino: depende de la validacion local TFLite, que no existe todavia |

## Datos y sesion (`src/`)
- `config.ts`: `EXPO_PUBLIC_API_URL` (por defecto `http://localhost:8090`; en el emulador de Android `http://10.0.2.2:8090`) y `EXPO_PUBLIC_KEYCLOAK_URL`.
- `api.tsx`: cliente comun `@sigec/api-client` (Metro lo toma de `packages/api-client/dist` con `metro.config.js`; hay que compilarlo antes: `pnpm --filter @sigec/api-client build`). El token se pide a la sesion en cada peticion.
- `offline/`: `db.ts` (SQLite: `cache`, `cola`), `datos.ts` (`useDatos`: copia por usuario, banner «Datos guardados en este telefono»), `cola.ts` (misma logica que la PWA).
- `plugins/con-app-auth.js`: config plugin que deja en el proyecto nativo `appAuthRedirectScheme=sigec` y HTTP en claro para desarrollo; se aplica con `expo prebuild`.

## Reglas
- Los iconos de la barra inferior son glifos de texto ocultos al lector de pantalla; la etiqueta visible es la que se lee. Sustituir por `react-native-svg` si se agrega.
- `app.json`: fondo del icono adaptativo = `--pri` (#0B6572). `expo prebuild --clean` sigue pendiente.
- Verificado con `tsc --noEmit` y `expo export --platform android` (Metro empaqueta 668 modulos, incluido el cliente comun). **No se ejecuto en dispositivo ni emulador**: el login nativo, SQLite y SecureStore estan sin probar.
