import angular from '@analogjs/vite-plugin-angular';
import { federation } from '@module-federation/vite';
import { defineConfig } from 'vite';

// Remoto Angular con Module Federation 2 (el mismo plugin y runtime que el remoto Vue): Angular se compila con Vite
// (@analogjs/vite-plugin-angular) y el shell lo carga con loadRemote('remoteAngular/mount').
export default defineConfig(({ mode }) => ({
  plugins: [
    angular({ tsconfig: mode === 'test' ? 'tsconfig.spec.json' : 'tsconfig.app.json' }),
    federation({
      name: 'remoteAngular',
      filename: 'remoteEntry.js',
      manifest: true,
      dts: false, // el shell carga el remoto sin tipos de Module Federation
      exposes: { './mount': './src/mount.ts' },
      // Angular va dentro del remoto: el shell (React) y el remoto Vue no lo usan, no hay nada que compartir.
      shared: {},
    }),
  ],
  server: {
    port: 4201,
    strictPort: true,
    origin: 'http://localhost:4201',
    cors: { origin: ['http://localhost:5173'] },
    fs: { allow: ['../..'] }, // packages/design-tokens y packages/api-client viven fuera de esta carpeta
  },
  preview: { port: 4201, strictPort: true, cors: { origin: ['http://localhost:5173'] } },
  build: { target: 'esnext' },
}));
