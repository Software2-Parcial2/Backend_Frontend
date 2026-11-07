# design.md · shell (host Module Federation)

Actor: personal de la clinica (recepcion, medico, caja, direccion). Sistema visual: `packages/design-tokens/design.md`.

## Rol en la arquitectura
- Es el **host**: da fondo/tipografia a la pagina (`.sigec .sigec-root`), el sidebar por rol y la barra superior. Los remotos se montan en `<main>` y
  solo dibujan el contenido (`.page`). No hay sidebar dentro de los remotos.
- Navegacion a los remotos con **hash**: `/clinica#/pacientes`, `/gestion#/ml`. El remoto lee `location.hash`; el shell no cambia el contrato `mount/unmount`.
- Menu por rol en `src/layout/menu.ts` (claim `realm_access.roles`). Un usuario con varios roles ve la union de sus grupos.

## Pantallas (todas las del diseno para el shell)
| Diseno | Ruta / componente | Nota |
|---|---|---|
| m1-login, estado-sesion | `pages/Login.tsx` (`expirada`) | con enlace a recuperar contrasena |
| m1-recuperar | `/recuperar` · `pages/Recuperar.tsx` | publica (sin sidebar); el envio real lo haria Keycloak |
| shell-recepcion / medico / caja / direccion | `/` · `pages/Home.tsx` | datos de ejemplo por rol |
| m1-usuarios / m1-usuario-nuevo | `/admin/usuarios`, `/admin/usuarios/nuevo` · `pages/admin/` | solo rol `administrador`; datos de ejemplo |
| m1-seguridad | `/admin/seguridad` · `pages/admin/Seguridad.tsx` | revocar sesiones y filtrar eventos (en memoria) |
| sys-servicios | `/admin/servicios` · `pages/admin/Servicios.tsx` | datos de ejemplo |
| m1-perfil | `/perfil` · `pages/Perfil.tsx` | usuario/rol/correo reales del token; la contrasena se cambia en Keycloak |
| estado-403, estado-error-red (503), 404 | `pages/Estados.tsx` | 503 se muestra cuando falla la carga de un remoto |
| web-sin-conexion | aviso global en `App.tsx` (`useOnline`) | banner cuando el navegador queda sin red |
| estado-vacio | en el remoto Angular (`pacientes.ts`) | |

## Reglas
- Estilos del shell: `src/App.css` (solo `body` y utilidades de pantalla completa); lo demas viene de `@sigec/design-tokens/sigec.css`.
- Fuentes por `html.tags` en `rsbuild.config.ts` (Google Fonts).
- Mantener los `data-testid` `username`, `roles`, `session-user`.
- Accesibilidad: `nav` con `aria-label`, `aria-current="page"`, botones reales, foco visible.
