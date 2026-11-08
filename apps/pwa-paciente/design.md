# design.md · PWA del paciente

Actor: paciente. Sistema visual: `packages/design-tokens/design.md`. Variante "portal" del diseno (topbar con navegacion, no sidebar).

## Module Federation
Ninguna: es una app independiente (puerto 5174, su propia URL), instalable. No comparte codigo con el shell; solo los **tokens** (`@sigec/design-tokens/sigec.css`,
importado en `src/portal.css`). Todo cuelga de `<div class="sigec sigec-root">`; `body` solo define margen y fondo.

## Navegacion
Rutas por hash sin dependencias (`src/useHashRoute.ts`): `#/inicio`, `#/citas`, `#/solicitar`, `#/pendientes`, `#/confirmada`, `#/datos`, `#/estudios`,
`#/preferencias`, `#/instalar`. Los enlaces son `<a href="#/...">`. El service worker precachea solo JS/CSS/HTML/SVG; las fuentes vienen de Google Fonts
(sin conexion cae a `system-ui`; alternativa `@fontsource`, ver `docs/PENDIENTES.md`).

## Pantallas (`src/pages/`; todas con datos reales)
| Diseno | Ruta | Componente | Datos |
|---|---|---|---|
| pwa-inicio | `#/inicio` | `Inicio` | `/api/pacientes/me`, proxima cita, estudios validados, cola local, ultima sincronizacion |
| pwa-citas | `#/citas` | `Citas` (Proximas/Historial) | `/api/citas?pacienteId`; cancelar; reprogramar lleva a `#/solicitar?reprogramar=<id>` (necesita conexion) |
| pwa-solicitar | `#/solicitar` | `Solicitar` | especialidades, medicos y disponibilidad reales (con copia local); **siempre** guarda en la cola y la envia en cuanto hay red |
| pwa-offline | `#/pendientes` | `Pendientes` | la cola (IndexedDB): Pendiente / Enviando / Confirmando / Confirmada / Conflicto / Caducada, con la clave de idempotencia |
| pwa-confirmada | `#/confirmada?id=` | `Confirmada` | `/api/citas/{id}` y su cargo |
| pwa-datos | `#/datos` | `Datos` | datos del paciente y contactos; los cambios de contacto son solicitudes a recepcion (`/solicitudes`) |
| pwa-estudios | `#/estudios` | `Estudios` | informes validados; subir un estudio (`origen=PACIENTE`) sin validador local (el servidor clasifica) |
| pwa-preferencias | `#/preferencias` | `PreferenciasPaciente` | canales, tipos de aviso, antelacion, vinculo de Telegram (codigo real con cuenta regresiva) y lista de avisos con «marcar como leido» |
| pwa-instalar | `#/instalar` | `Instalar` | sin `beforeinstallprompt` |
| Login | — | `App.tsx` | Keycloak (PKCE) |

## Datos y modo sin conexion (`src/api.tsx`, `src/offline/`)
- `ApiProvider` crea el cliente comun con el token vigente de la sesion (renueva en silencio ante un 401) y `VITE_API_URL`; `VITE_KEYCLOAK_URL` cambia el login. Las peticiones usan `cache: 'no-store'`: lo que se ve sin red viene de la copia propia, no de una respuesta vieja del navegador.
- `useDatos(clave, cargar)`: lee del servidor y guarda una copia por usuario en IndexedDB; si no hay red muestra la copia con el banner «Datos guardados en este dispositivo» y la hora de la ultima sincronizacion.
- `cola.ts`: cada solicitud de cita nace con su `Idempotency-Key` y la conserva en cada reintento (valida 24 h). Se procesa al abrir, al evento `online` y cada 20 s. `409/422/400` = Conflicto; sin red = sigue Pendiente; la SAGA que cancela = Conflicto con el motivo. Una solicitud en conflicto o caducada es otra intencion: «Elegir otro horario».
- Cargando / error (con codigo de soporte) / vacio en `pages/ui.tsx`.

## Reglas
- Objetivos tactiles >= 44 px (`.pn a`, `.day`, `.slot` con `height: 44`). El estado de conexion usa chip + texto.
- Mantener `data-testid="estado-conexion"`.
- `theme_color` del manifest = `--pri` (#0B6572); `background_color` = `--bg`.
