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
| m1-recuperar | `/recuperar` · `pages/Recuperar.tsx` | publica (sin sidebar); el envio lo hace Keycloak (flujo `reset-credentials`): ms1 solo recupera cuentas desde el panel del administrador |
| shell-recepcion / medico / caja / direccion | `/` · `pages/Home.tsx` | KPIs y listas reales por rol (agenda, caja, resumen, alertas) |
| m1-usuarios / m1-usuario-nuevo | `/admin/usuarios`, `/admin/usuarios/nuevo` · `pages/admin/` | solo rol `administrador`; `GET/POST /api/identidad/usuarios`, habilitar, roles, recuperar; errores por campo (`USUARIO_DUPLICADO`, `ROLES_INCOMPATIBLES`) |
| m1-seguridad | `/admin/seguridad` · `pages/admin/Seguridad.tsx` | sesiones, revocar y eventos reales de Keycloak |
| sys-servicios | `/admin/servicios` · `pages/admin/Servicios.tsx` | `GET /api/salud` (estado de la pila) |
| m1-perfil | `/perfil` · `pages/Perfil.tsx` | usuario/rol/correo reales del token; la contrasena se cambia en Keycloak |
| estado-403, estado-error-red (503), 404 | `pages/Estados.tsx` | 503 se muestra cuando falla la carga de un remoto |
| web-sin-conexion | aviso global en `App.tsx` (`useOnline`) | banner cuando el navegador queda sin red |
| estado-vacio | en el remoto Angular (`pacientes.ts`) | |

## Reglas
- Estilos del shell: `src/App.css` (solo `body` y utilidades de pantalla completa); lo demas viene de `@sigec/design-tokens/sigec.css`.
- Fuentes por `html.tags` en `rsbuild.config.ts` (Google Fonts).
- Mantener los `data-testid` `username`, `roles`, `session-user`.
- Accesibilidad: `nav` con `aria-label`, `aria-current="page"`, botones reales, foco visible.

## Datos (`src/api/`)
`ApiProvider` crea el cliente comun `@sigec/api-client` (token del `useAuth()` en cada peticion, `signinSilent` ante un 401) y un `QueryClient`; hooks `useGet/useLista/useAccion`. `components/Estado.tsx` pinta cargando / error (codigo de soporte) / vacio. A los remotos se les pasa `apiUrl` en `mount()` (`PUBLIC_API_URL`, por defecto `http://localhost:8090`).
