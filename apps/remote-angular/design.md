# design.md · remoto Angular (clinica)

Actor: recepcion, medico, caja, administrador. Sistema visual: `packages/design-tokens/design.md`.
Cubre MS2 pacientes, MS3 agenda/citas, MS4 historias, MS5 estudios, MS6 caja y MS8 historial, todo bajo `/clinica` del shell.

## Module Federation 2 (Vite)
- Mismo plugin y runtime que el remoto Vue: `@module-federation/vite` + `@analogjs/vite-plugin-angular` (Angular compilado por Vite; ver `vite.config.ts`). Genera `mf-manifest.json` y `remoteEntry.js`; el shell lo carga con `loadRemote('remoteAngular/mount')`. Angular va dentro del remoto (no se comparte con React ni con Vue). `ng test` sigue usando el builder de Angular (target `build` solo para las pruebas). `pnpm-workspace.yaml` fija `typescript ~6.0` para el plugin de Analog (con la 7.x falla `ts.createPrinter`).
- Expone `./mount` (`src/mount.ts`). El **sidebar y la barra superior los pone el shell**; el remoto solo dibuja el contenido (`.page`).
- **Estilos:** `App` usa `ViewEncapsulation.None` y `styleUrl` -> `packages/design-tokens/sigec.css`. Los estilos viajan en el JS del remoto
  (los estilos globales de la compilacion no se cargan cuando lo monta el shell) y todo queda bajo `.sigec`; no se toca `html`/`body`.
  `src/styles.css` (solo `body`) vale unicamente para el modo independiente (`vite`, 4201).
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
- Todas las pantallas leen y escriben contra el gateway con `ApiService` (`@sigec/api-client`); el token y la `apiUrl` se leen del `ContextStore` en cada peticion. Ya no quedan datos de ejemplo.
- Componentes standalone con plantilla en linea; `@` en plantillas se escribe `&#64;`; los `{`/`}` literales se evitan.
- Acciones = `button`/`a` reales; tablas dentro de `.scroll`; ningun estado depende solo del color.

## Datos reales: patrones comunes
- **Estados de una lectura:** `recurso()`/`lista()` dan `cargando`, `error` y datos; la UI usa `<sigec-cargando>` (esqueleto), `<sigec-error>` (titulo claro, codigo de soporte = `correlationId`, boton Reintentar) y `<sigec-vacio>`. El 403 explica que el rol no incluye la operacion.
- **Ids por query:** las rutas son estaticas y el id viaja en el hash (`#/cita?id=…`, `#/historia?paciente=…`, `#/resultado?id=…`). Si un mismo componente se reutiliza con otro id, reinicia su formulario y su clave de idempotencia (ver `cobro.ts`).
- **Escrituras:** una `Idempotency-Key` por intencion (`nuevaIntencion()`), la misma al reintentar; ediciones con `If-Match` y el `409 VERSION_CONFLICTO` se muestra sin perder lo escrito (consulta → `#/consulta/conflicto`, plantillas → «Cargar la version vigente»).
- **Cambios respecto al diseno por falta de endpoint o de rol:** la consulta no tiene «anamnesis» ni «CIE-10» separados (campos `motivo`, `diagnostico`, `tratamiento`, `indicaciones`, signos vitales y receta); la carga de estudios revisa formato/tamano y calcula el SHA-256 en el navegador, pero **no** corre el validador MobileNet local (la clasificacion de contenido la hace el servidor; pendiente); «Historial de envios» se consulta por paciente (MS8 lo exige) con KPIs globales del dia; las preferencias del personal son las 3 alertas internas reales; la bitacora de auditoria usa la accion real (`LEER/CREAR/MODIFICAR/EXPORTAR`) y el id de historia en la URL porque el administrador no puede leer la historia.
- **Roles reales:** subir/validar estudios es de `medico` (y administrador/paciente para subir); cobrar y anular es de `caja`/`administrador`; el tarifario solo lo edita `administrador`.
