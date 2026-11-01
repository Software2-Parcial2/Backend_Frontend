import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { oidcConfig } from './oidc.ts'

// Service worker (modo generateSW). La logica offline de datos llegara despues.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
