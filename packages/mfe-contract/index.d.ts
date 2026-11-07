/**
 * Contrato entre el shell (host) y los microfrontends (remotos).
 * Ver contracts/microfrontend-contract.md.
 */

/** Usuario autenticado, derivado de las claims del JWT de Keycloak. */
export interface MfeUser {
  sub: string;
  username?: string;
  email?: string;
  /** Roles de realm (realm_access.roles): administrador, medico, recepcion, caja, paciente. */
  roles: string[];
}

/** Contexto que el shell entrega al remoto en mount(). */
export interface MfeContext {
  /** Access token vigente (JWT). El remoto lo envia como `Authorization: Bearer`. */
  token: string;
  user: MfeUser;
  roles: string[];
  /** Base del gateway (p. ej. http://localhost:8090, sin barra final). El remoto NO debe fijar la suya: usa esta. */
  apiUrl: string;
}

/** Monta el remoto dentro de `el`. Puede ser asincrona (p. ej. Angular). */
export type MfeMount = (el: HTMLElement, ctx: MfeContext) => void | Promise<void>;

/** Desmonta el remoto y libera todo lo que mount() creo. */
export type MfeUnmount = () => void | Promise<void>;

/** Modulo que cada remoto expone como `./mount`. */
export interface MfeModule {
  mount: MfeMount;
  unmount: MfeUnmount;
}

/** Eventos DOM del contrato (se emiten sobre el elemento donde esta montado el remoto). */
export interface MfeEventMap {
  /** shell -> remoto: el token se renovo. */
  'sigec:token-refreshed': CustomEvent<{ token: string }>;
  /** remoto -> shell: pide navegar a una ruta del shell (burbujea). */
  'sigec:navigate': CustomEvent<{ path: string }>;
}
