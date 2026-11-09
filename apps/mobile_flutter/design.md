# App móvil del paciente (Flutter)

Port de la app React Native (Expo) a Flutter, con las mismas 9 pantallas y el mismo flujo. Tokens visuales de
`packages/design-tokens` copiados en `lib/theme.dart` (si cambias un valor, cámbialo también allí y en `sigec.css`).

## Pantallas y rutas (go_router)
| Pantalla | Ruta | Pestaña resaltada |
|---|---|---|
| Login (OIDC + PKCE, `sigec://callback`) | `/login` | — (sin tabbar) |
| Inicio · Mis citas | `/` | Citas |
| Detalle de cita | `/detalle/:id` | Citas |
| Solicitar / Reprogramar | `/solicitar?reprogramar=id` | Solicitar |
| Solicitudes guardadas (cola) | `/pendiente` | Solicitar |
| Cita confirmada | `/confirmada/:id` | Citas |
| Avisos | `/avisos` | Avisos |
| Perfil | `/perfil` | Perfil |
| Mis estudios | `/estudio` | Perfil |

Sin sesión todo redirige a `/login`. Tabbar de 72 px: Citas ▦, Solicitar +, Avisos ◔, Perfil ◯.

## Capas (`lib/`)
- `api/`: cliente HTTP (problem+json, `Idempotency-Key`, `X-Correlation-Id`, cursor, `esperarCita`) y formatos de La Paz (UTC-4).
- `sesion/`: `flutter_appauth`; solo el refresh token va a `flutter_secure_storage`, el access token vive en memoria.
- `offline/`: SQLite (`cache` por usuario y `cola`). La cola conserva la `Idempotency-Key` en cada reintento (vigencia 24 h);
  estados Pendiente / Enviando / Confirmando / Confirmada / Conflicto / Caducada.
- `providers.dart`: lecturas con copia local (`Peticion` + `ref.leer`); sin red muestran la copia con el aviso «Datos guardados en este teléfono».
- `widgets/ui.dart`: Chip, Card, Boton, Aviso, Fila, Interruptor, Barra, Casilla (táctiles ≥ 44 px, `Semantics`).

## Ejecutar
Ver `docs/tu-parte.md` §6. Direcciones con `--dart-define=API_URL=… --dart-define=KEYCLOAK_URL=…`.

## Pendiente (igual que en la app RN)
Subir estudios desde el teléfono (selector de imagen) y el validador TFLite local; fuentes Public Sans / IBM Plex Mono (se usa la del sistema).
