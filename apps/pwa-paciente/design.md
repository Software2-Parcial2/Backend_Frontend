# design.md · PWA del paciente

Actor: paciente. Sistema visual: `packages/design-tokens/design.md`. Variante "portal" del diseno (topbar con navegacion, no sidebar).

## Module Federation
Ninguna: es una app independiente (puerto 5174, su propia URL), instalable. No comparte codigo con el shell; solo los **tokens** (`@sigec/design-tokens/sigec.css`,
importado en `src/portal.css`). Todo cuelga de `<div class="sigec sigec-root">`; `body` solo define margen y fondo.

## Navegacion
Rutas por hash sin dependencias (`src/useHashRoute.ts`): `#/inicio`, `#/citas`, `#/solicitar`, `#/pendientes`, `#/confirmada`, `#/datos`, `#/estudios`,
`#/preferencias`, `#/instalar`. Los enlaces son `<a href="#/...">`. El service worker precachea solo JS/CSS/HTML/SVG; las fuentes vienen de Google Fonts
(sin conexion cae a `system-ui`; alternativa `@fontsource`, ver `docs/PENDIENTES.md`).

## Pantallas
| Diseno | Ruta | Componente (`src/pages/Paginas.tsx`) | Estado |
|---|---|---|---|
| pwa-inicio | `#/inicio` | `Inicio` | hecho |
| pwa-citas | `#/citas` | `Citas` (pestanas Proximas/Historial) | hecho |
| pwa-solicitar | `#/solicitar` | `Solicitar` (dia y hora seleccionables; aviso si no hay conexion) | hecho |
| pwa-offline | `#/pendientes` | `Pendientes` | hecho (datos de ejemplo) |
| pwa-confirmada | `#/confirmada` | `Confirmada` | hecho |
| pwa-datos | `#/datos` | `Datos` | hecho |
| pwa-estudios | `#/estudios` | `Estudios` | hecho (sin validador TFLite/TF.js todavia) |
| pwa-preferencias | `#/preferencias` | `Preferencias` (interruptores `role="switch"`) | hecho |
| pwa-instalar | `#/instalar` | `Instalar` | hecho (sin `beforeinstallprompt`) |
| Login | — | `App.tsx` (pantalla de acceso con Keycloak) | hecho |

## Reglas
- Solo UI: la cola offline (IndexedDB + Idempotency-Key) y las APIs siguen pendientes (`docs/PENDIENTES.md`).
- Objetivos tactiles >= 44 px (`.pn a`, `.day`, `.slot` con `height: 44`). El estado de conexion usa chip + texto.
- Mantener `data-testid="estado-conexion"`.
- `theme_color` del manifest = `--pri` (#0B6572); `background_color` = `--bg`.
