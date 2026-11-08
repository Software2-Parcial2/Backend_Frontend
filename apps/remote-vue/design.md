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

## Pantallas (todas las del diseno para este remoto)
| Diseno | Vista | Componente |
|---|---|---|
| ms7-dashboard | `#/` | `ResumenGestion.vue` (datos reales via GraphQL de MS7) |
| ms7-asistente | `#/asistente` | `PanelAgente.vue` (texto, voz, exportar xlsx/csv/pdf) |
| ms7-voz | `#/asistente/voz` y, en vivo, mientras el asistente escucha | `VistaVoz.vue` (la usa `PanelAgente` al dictar; la ruta es la version de ejemplo) |
| ms7-reporte-pdf | `#/asistente/pdf` | `VistaReportePdf.vue` (vista previa de ejemplo) |
| ms7-ml | `#/ml` | `VistaMl.vue`: riesgo por cita (GraphQL `riesgoInasistencia`), calidad del modelo (`/ml/modelo`) y segmentos de demanda (`demandaEspecialidades`); declara los datos sinteticos. El mapa de calor dia x franja del diseno se sustituyo por los segmentos reales (no hay datos por franja) |
| ms7-alertas / alerta-detalle | `#/alertas`, `#/alertas/detalle/<id>` | `VistaAlertas.vue` (alertas nuevas/revisadas, agentes: activar y ejecutar solo el administrador) y `VistaAlertaDetalle.vue` (datos agregados, marcar como atendida con nota, `409 ALERTA_YA_ATENDIDA`). El aviso por Telegram se vincula en las preferencias del personal (MS8), no aqui |
| ms7-politicas | `#/politicas` | `VistaPoliticas.vue`: la pregunta va al agente (`POST /agente/consulta`, que usa el RAG); lista los documentos indexados (`/rag/estado`). No hay REST de busqueda directa, por eso la respuesta es la del agente |

## Reglas
- Datos: `lib/api.ts` (`crearApi` con `@sigec/api-client`, lee token y `apiUrl` del contexto en cada peticion) + `lib/usar.ts` (`usarLectura`/`usarAccion`, cancelan al desmontar) + `EstadoError.vue` (titulo claro y codigo de soporte). Apollo sigue para `/graphql`.
- El icono del microfono es SVG en linea (sin emoji). Estados con chip + texto, no solo color.
- Interruptores `.sw` son `button role="switch"` con `aria-checked`.
