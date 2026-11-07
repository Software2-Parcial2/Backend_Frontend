# design.md · remoto Angular (clinica)

Actor: recepcion, medico, caja, administrador. Sistema visual: `packages/design-tokens/design.md`.
Cubre MS2 pacientes, MS3 agenda/citas, MS4 historias, MS5 estudios, MS6 caja y MS8 historial, todo bajo `/clinica` del shell.

## Module Federation (Native Federation)
- Expone `./mount` (`src/mount.ts`). El **sidebar y la barra superior los pone el shell**; el remoto solo dibuja el contenido (`.page`).
- **Estilos:** `App` usa `ViewEncapsulation.None` y `styleUrl` -> `packages/design-tokens/sigec.css`. Los estilos viajan en el JS del remoto
  (los estilos globales de la compilacion no se cargan cuando lo monta el shell) y todo queda bajo `.sigec`; no se toca `html`/`body`.
  `src/styles.scss` (solo `body`) vale unicamente para el modo independiente (`ng serve`, 4201).
- Se retiro el tema global de Angular Material (`material-theme.scss`), que pisaba `html`/`body` del shell. Material sigue instalado pero no se usa.
- Presupuesto `anyComponentStyle` subido a 16/24 kB porque el CSS compartido pesa ~12 kB.
- **Rutas por hash** (`withHashLocation`): el shell es dueno de la URL (`/clinica#/pacientes`). Dentro del remoto se navega con `<a href="#/ruta">`;
  el shell reenvia `hashchange` cuando su menu cambia el fragmento (`RemoteContainer.tsx`). Entrada por rol: `app.routes.ts` (`entradaPorRol`).
- El contexto (`token`, roles) llega por `mount()` y se guarda en `ContextStore`.

## Pantallas
| Diseno | Ruta | Componente | Estado |
|---|---|---|---|
| ms2-pacientes | `#/pacientes` | `pages/pacientes.ts` | hecho (datos de ejemplo) |
| ms2-nuevo / ms2-guardado | `#/pacientes/nuevo` | `paciente-nuevo.ts` | hecho / guardado: fase 2 |
| ms2-ficha | `#/pacientes/ficha` | `paciente-ficha.ts` | hecho |
| ms3-agenda | `#/agenda` | `agenda.ts` | hecho |
| ms3-reservar | `#/reservar` | `reservar.ts` | hecho (dia y hora seleccionables) |
| ms3-detalle | `#/cita` | `cita-detalle.ts` (SAGA con `.tl`) | hecho |
| ms4-historia / ms4-consulta | `#/historia`, `#/consulta` | `historia.ts`, `consulta.ts` | hecho |
| ms5-estudios / ms5-resultado | `#/estudios`, `#/resultado` | `estudios.ts`, `resultado.ts` (Grad-CAM) | hecho |
| ms6-caja / ms6-cobro | `#/caja`, `#/cobro` | `caja.ts`, `cobro.ts` | hecho |
| ms8-historial | `#/historial` | `historial.ts` | hecho |
| Fase 2 | — | ms2-solicitudes, ms3-horarios/medico/compensacion/reprogramar/cancelar, ms4-auditoria/conflicto/pestanas/receta, ms5-cargar/rechazada, ms6-tarifario/movimientos/tarifa-form/anular, ms8-plantillas/preferencias | pendiente |

## Reglas
- Datos de ejemplo del diseno; conectar a MS2/MS3/... despues (el token esta en `ContextStore`).
- Componentes standalone con plantilla en linea; `@` en plantillas se escribe `&#64;`; los `{`/`}` literales se evitan.
- Acciones = `button`/`a` reales; tablas dentro de `.scroll`; ningun estado depende solo del color.
