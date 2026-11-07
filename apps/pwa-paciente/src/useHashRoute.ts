import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Ruta actual a partir del fragmento (#/citas -> 'citas'). Sin dependencias: la PWA solo tiene 9 pantallas. */
export function useHashRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'inicio',
    () => 'inicio',
  )
}
