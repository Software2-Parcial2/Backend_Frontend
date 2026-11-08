import { useMemo, useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const hash = () => window.location.hash

/** Ruta actual a partir del fragmento (#/citas?x=1 -> 'citas'). Sin dependencias: la PWA solo tiene 9 pantallas. */
export function useHashRoute(): string {
  const h = useSyncExternalStore(subscribe, hash, () => '')
  return h.replace(/^#\/?/, '').split(/[/?]/)[0] || 'inicio'
}

/** Parametros del fragmento (#/confirmada?id=...). */
export function useHashParams(): URLSearchParams {
  const h = useSyncExternalStore(subscribe, hash, () => '')
  return useMemo(() => new URLSearchParams(h.split('?')[1] ?? ''), [h])
}
