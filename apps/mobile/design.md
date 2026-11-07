# design.md · app movil (Expo / React Native)

Actor: paciente. Cliente aparte, sin Module Federation. Sistema visual: `packages/design-tokens/design.md`; aqui se traduce a `StyleSheet`.

## Tokens
`src/theme.ts` es una **copia** de `packages/design-tokens/tokens.js` (esta app usa npm, no el workspace de pnpm, asi que no puede importar el paquete).
Si cambias un valor, cambialo en los tres sitios: `sigec.css`, `tokens.js` y `theme.ts`. Fuente: la del sistema; Public Sans / IBM Plex Mono quedan para cuando se agregue `expo-font`.

## Componentes (`src/ui.tsx`)
`Chip` (punto + texto, `.chip`) · `Card` (`.mc`, 14 px de radio) · `Boton` (52 px, `.mbtn`: normal/pri/peligro/claro) · `Aviso` (`.banner`) ·
`Fila` (`.li`) · `Interruptor` (`Switch` nativo) · `Barra` (`.mt`, con volver). Objetivos tactiles >= 44 px; todo control es `Pressable` con `accessibilityRole`.

## Pantallas (`src/screens.tsx`, navegacion por pila en `App.tsx`)
| Diseno | Pantalla | Estado |
|---|---|---|
| mov-login | `Login` (boton salta a Inicio; OIDC+PKCE con `react-native-app-auth` pendiente) | hecho (maqueta) |
| mov-inicio | `Inicio` | hecho |
| mov-detalle | `Detalle` | hecho |
| mov-solicitar | `Solicitar` (dia y hora seleccionables) | hecho |
| mov-pendiente | `Pendiente` | hecho |
| mov-confirmada | `Confirmada` | hecho (se llega desde Detalle; falta el evento real de confirmacion) |
| mov-notificaciones | `Avisos` | hecho |
| mov-perfil | `Perfil` | hecho |
| mov-estudio, mov-estudio-rechazado | `Estudio` (`rechazado`) | hecho (sin validacion TFLite real) |

## Reglas
- Solo UI con datos de ejemplo; SQLite (cola offline), SecureStore (tokens) y TFLite siguen pendientes (`docs/PENDIENTES.md`).
- Los iconos de la barra inferior son glifos de texto ocultos al lector de pantalla; la etiqueta visible es la que se lee. Sustituir por `react-native-svg` si se agrega.
- `app.json`: fondo del icono adaptativo = `--pri` (#0B6572). `expo prebuild --clean` sigue pendiente.
- Verificado solo con `tsc --noEmit`; no se compilo ni se ejecuto en dispositivo/emulador.
