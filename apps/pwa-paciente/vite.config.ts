import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SIGEC Paciente',
        short_name: 'SIGEC',
        description: 'Portal del paciente de SIGEC',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b3d5c',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: '/index.html',
        // El callback OIDC (?code=&state=) y las llamadas a Keycloak/API no se cachean.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
