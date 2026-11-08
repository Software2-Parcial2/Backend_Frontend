import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { registerSW } from 'virtual:pwa-register'
import { ApiProvider } from './api.tsx'
import App from './App.tsx'
import { oidcConfig } from './oidc.ts'

// Service worker (modo generateSW): cachea la app. Los datos y la cola de solicitudes viven en IndexedDB (src/offline).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <ApiProvider>
        <App />
      </ApiProvider>
    </AuthProvider>
  </StrictMode>,
)
