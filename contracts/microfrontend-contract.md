# Contrato de microfrontends (shell ↔ remotos)

El shell (React, Rsbuild + Module Federation) carga remotos escritos en otros frameworks. Para que sean
intercambiables, **todo remoto expone el modulo `./mount`** con dos funciones. El tipo TypeScript vive en
`packages/mfe-contract` (`@sigec/mfe-contract`).

## Firma

```ts
mount(el: HTMLElement, ctx: { token: string; user: MfeUser; roles: string[]; apiUrl: string }): void | Promise<void>
unmount(): void | Promise<void>
```

`MfeUser = { sub: string; username?: string; email?: string; roles: string[] }`

## Remotos

| Remoto | Tecnologia | Federacion | Entrada | Modulo |
|---|---|---|---|---|
| `remoteVue` (`/gestion`) | Vue 3 + Vite | Module Federation (`@module-federation/vite`) | `http://localhost:5175/mf-manifest.json` | `remoteVue/mount` |
| `remoteAngular` (`/clinica`) | Angular | Native Federation | `http://localhost:4201/remoteEntry.json` | `./mount` |

Cada remoto tambien debe poder abrirse **solo** en su puerto (modo standalone, sin contexto).

## Reglas

0. **URL del API.** El shell entrega la base del gateway en `ctx.apiUrl` (variable `PUBLIC_API_URL` del shell, por defecto `http://localhost:8090`). El remoto la usa para todas sus llamadas y **no** fija la suya (solo en modo standalone puede caer en `VITE_API_URL` / un valor por defecto). Para llamar al API se usa `@sigec/api-client` leyendo `ctx.token` y `ctx.apiUrl` en cada peticion.
1. **Token.** El shell entrega el access token en `ctx.token`. El remoto lo usa en `Authorization: Bearer <token>`
   hacia el gateway (`http://localhost:8090/api/...`). El remoto **no** hace login propio ni guarda el token
   en `localStorage`/`sessionStorage`.
2. **Renovacion.** Cuando el token se renueva, el shell emite sobre `el` el evento
   `sigec:token-refreshed` con `detail: { token }`. El remoto debe usar el token nuevo en las peticiones siguientes.
3. **Navegacion.** Para cambiar de ruta del shell, el remoto emite sobre su `el` el evento
   `sigec:navigate` (`bubbles: true`) con `detail: { path }`. El remoto no modifica `window.location`.
4. **Un solo mount.** El shell llama a `mount` una vez por visita a la ruta y a `unmount` al salir. Si `mount`
   se invoca otra vez sin `unmount`, el remoto debe desmontar primero la instancia anterior.
5. **Limpieza.** `unmount()` destruye la app del framework, quita listeners (de `el` y de `window`/`document`),
   cancela temporizadores y peticiones en curso, y deja `el` vacio. No debe dejar estilos globales ni
   variables en `window`.
6. **Aislamiento.** El remoto solo toca el DOM dentro de `el`. Los estilos deben estar acotados a ese arbol.
7. **Dependencias compartidas.** `react` y `react-dom` son singletons del shell. Vue y Angular se empaquetan
   o comparten dentro de su propio remoto; no se comparten entre frameworks.
8. **Errores.** Si `mount` falla, el remoto lanza la excepcion; el shell muestra un mensaje y permite reintentar.
9. **CORS.** Los remotos sirven sus archivos con `Access-Control-Allow-Origin` para el origen del shell
   (`http://localhost:5173`) en desarrollo.

## Ejemplo (Vue)

```ts
// src/mount.ts
let app: App | null = null;
export function mount(el: HTMLElement, ctx: MfeContext) {
  app?.unmount();
  app = createApp(Dashboard, { ctx });
  app.mount(el);
}
export function unmount() {
  app?.unmount();
  app = null;
}
```
