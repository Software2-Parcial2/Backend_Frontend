# design.md · remoto Vue (gestion empresarial, MS7)

Actor: direccion / administrador (y recepcion/caja con vista parcial). Sistema visual: `packages/design-tokens/design.md`.
Dashboard de MS7 bajo `/gestion` del shell.

## Module Federation
- Expone `./mount` (`src/mount.ts`); comparte `vue` como singleton. Sidebar y barra superior los pone el shell.
- **Estilos:** `App.vue` importa `@sigec/design-tokens/sigec.css` en un `<style>` sin `scoped` (Vite lo empaqueta en el chunk del remoto).
  Todo el contenido cuelga de `<div class="sigec">`; nada global salvo variables CSS. Los estilos propios de una vista van en `<style scoped>`.
- **Rutas por hash** (`/gestion#/ml`): `App.vue` lee `location.hash` y escucha `hashchange`/`popstate`; el shell reenvia `hashchange`
  cuando su menu cambia el fragmento. Las pestanas internas son `<a href="#/...">`.
- ECharts no lee variables CSS: `PALETA` y `TEXTO` en `src/lib/graficos.ts` replican los tokens (`--pri`, etc.).

## Pantallas
| Diseno | Vista | Componente | Estado |
|---|---|---|---|
| ms7-dashboard | `#/` | `ResumenGestion.vue` (datos reales via GraphQL de MS7) | hecho |
| ms7-asistente, ms7-voz | `#/asistente` | `PanelAgente.vue` (texto, voz, exportar xlsx/csv/pdf) | hecho |
| ms7-ml | `#/ml` | `VistaMl.vue` | hecho (datos de ejemplo) |
| ms7-alertas | `#/alertas` | `VistaAlertas.vue` | hecho (datos de ejemplo) |
| ms7-politicas | `#/politicas` | `VistaPoliticas.vue` | hecho (texto de ejemplo con marcadores `[...]`) |
| ms7-alerta-detalle, ms7-reporte-pdf | — | — | fase 2 |

## Reglas
- La logica (`lib/api.ts`, `consultas.ts`, `voz.ts`) no cambia; solo la capa visual.
- El icono del microfono es SVG en linea (sin emoji). Estados con chip + texto, no solo color.
- Interruptores `.sw` son `button role="switch"` con `aria-checked`.
