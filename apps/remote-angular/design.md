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

## Pantallas (todas las del diseno para este remoto)
| Diseno | Ruta | Componente (`src/app/pages/`) |
|---|---|---|
| ms2-pacientes (+ estado vacio) | `#/pacientes` | `pacientes.ts` (busqueda funcional, tolera h/j y tildes) |
| ms2-nuevo / ms2-guardado | `#/pacientes/nuevo`, `#/pacientes/guardado` | `paciente-nuevo.ts`, `paciente-guardado.ts` |
| ms2-ficha / ms2-solicitudes | `#/pacientes/ficha`, `#/pacientes/solicitudes` | `paciente-ficha.ts`, `solicitudes.ts` |
| ms3-agenda / ms3-reservar | `#/agenda`, `#/reservar` | `agenda.ts`, `reservar.ts` |
| ms3-detalle / compensacion / reprogramar / cancelar | `#/cita`, `#/cita/compensacion`, `#/cita/reprogramar`, `#/cita/cancelar` | `cita-detalle.ts`, `cita-compensacion.ts`, `cita-reprogramar.ts`, `cita-cancelar.ts` (los dos ultimos son dialogos `.modal`) |
| ms3-horarios / ms3-medico | `#/horarios`, `#/agenda-medico` | `horarios.ts`, `agenda-medico.ts` |
| ms4-historia / consulta / conflicto | `#/historia`, `#/consulta`, `#/consulta/conflicto` | `historia.ts`, `consulta.ts`, `consulta-conflicto.ts` |
| ms4-pestanas / auditoria / receta | `#/historia/detalle`, `#/historia/auditoria`, `#/historia/receta` | `historia-detalle.ts`, `auditoria.ts`, `receta.ts` |
| ms5-estudios / resultado | `#/estudios`, `#/resultado` | `estudios.ts`, `resultado.ts` |
| ms5-cargar / rechazada | `#/estudios/cargar`, `#/estudios/rechazada` | `estudio-cargar.ts`, `estudio-rechazada.ts` |
| ms6-caja / cobro / movimientos / anular | `#/caja`, `#/cobro`, `#/movimientos`, `#/caja/anular` | `caja.ts`, `cobro.ts`, `movimientos.ts`, `caja-anular.ts` |
| ms6-tarifario / tarifa-form | `#/tarifario`, `#/tarifario/nueva` | `tarifario.ts`, `tarifa-nueva.ts` |
| ms8-historial / plantillas / preferencias-personal | `#/historial`, `#/historial/plantillas`, `#/historial/preferencias` | `historial.ts`, `plantillas.ts`, `preferencias-personal.ts` |

## Reglas
- Montaje: `mount.ts` llama a `Router.initialNavigation()` a mano (con `createApplication` + `createComponent` no hay bootstrap y el router no navegaba). El router de Angular solo reacciona a `popstate`: el shell emite `popstate` y `hashchange` al cambiar el fragmento.
- El build de produccion no incrusta fuentes de Google (`optimization.fonts.inline=false`): fallaba sin red.
- Datos de ejemplo del diseno; conectar a MS2/MS3/... despues (el token esta en `ContextStore`).
- Componentes standalone con plantilla en linea; `@` en plantillas se escribe `&#64;`; los `{`/`}` literales se evitan.
- Acciones = `button`/`a` reales; tablas dentro de `.scroll`; ningun estado depende solo del color.
