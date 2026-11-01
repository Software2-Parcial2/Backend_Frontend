import type { MfeContext } from '@sigec/mfe-contract'
import { createApp, reactive, type App as VueApp } from 'vue'
import App from './App.vue'

let app: VueApp | null = null
let host: HTMLElement | null = null
let state: { ctx?: MfeContext } | null = null

function onTokenRefreshed(event: Event) {
  const { token } = (event as CustomEvent<{ token: string }>).detail
  if (state?.ctx) state.ctx = { ...state.ctx, token }
}

/** Contrato SIGEC: monta el dashboard de gestion dentro de `el`. */
export function mount(el: HTMLElement, ctx: MfeContext): void {
  if (app) unmount()
  host = el
  state = reactive({ ctx })
  app = createApp(App, { state })
  app.mount(el)
  el.addEventListener('sigec:token-refreshed', onTokenRefreshed)
}

/** Contrato SIGEC: libera la app y los listeners; deja el elemento vacio. */
export function unmount(): void {
  host?.removeEventListener('sigec:token-refreshed', onTokenRefreshed)
  app?.unmount()
  app = null
  host = null
  state = null
}
