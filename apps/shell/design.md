# design.md · shell (host Module Federation)

Actor: personal de la clinica (recepcion, medico, caja, direccion). Sistema visual: `packages/design-tokens/design.md`.

## Rol en la arquitectura
- Es el **host**: da fondo/tipografia a la pagina (`.sigec .sigec-root`), el sidebar por rol y la barra superior. Los remotos se montan en `<main>` y
  solo dibujan el contenido (`.page`). No hay sidebar dentro de los remotos.
- Navegacion a los remotos con **hash**: `/clinica#/pacientes`, `/gestion#/ml`. El remoto lee `location.hash`; el shell no cambia el contrato `mount/unmount`.
- Menu por rol en `src/layout/menu.ts` (claim `realm_access.roles`). Un usuario con varios roles ve la union de sus grupos.

## Pantallas
| Diseno | Ruta / componente | Estado |
|---|---|---|
| m1-login, estado-sesion | `pages/Login.tsx` (sesion expirada con `expirada`) | hecho |
| shell-recepcion / medico / caja / direccion | `pages/Home.tsx` (datos de ejemplo por rol) | hecho |
| estado-403, estado-vacio, pagina 404 | `pages/Estados.tsx` (`SinPermiso`, `NoEncontrada`) | hecho |
| estado-error-red (503) | `RemoteContainer.tsx` (banner de error + Reintentar) | hecho |
| m1-usuarios, m1-seguridad, m1-perfil, m1-usuario-nuevo, m1-recuperar | — | fase 2 |
| sys-servicios, web-sin-conexion | — | fase 2 |

## Reglas
- Estilos del shell: `src/App.css` (solo `body` y utilidades de pantalla completa); lo demas viene de `@sigec/design-tokens/sigec.css`.
- Fuentes por `html.tags` en `rsbuild.config.ts` (Google Fonts).
- Mantener los `data-testid` `username`, `roles`, `session-user`.
- Accesibilidad: `nav` con `aria-label`, `aria-current="page"`, botones reales, foco visible.
