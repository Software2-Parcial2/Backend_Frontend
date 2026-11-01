import { federation } from '@module-federation/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remoteVue',
      filename: 'remoteEntry.js',
      manifest: true,
      dts: false, // el shell carga el remoto sin tipos de Module Federation
      exposes: {
        './mount': './src/mount.ts',
      },
      shared: {
        vue: { singleton: true },
      },
    }),
  ],
  server: {
    port: 5175,
    strictPort: true,
    // El shell (5173) carga este remoto desde otro origen.
    origin: 'http://localhost:5175',
    cors: { origin: ['http://localhost:5173'] },
  },
  preview: { port: 5175, strictPort: true, cors: { origin: ['http://localhost:5173'] } },
  build: { target: 'esnext' },
})
