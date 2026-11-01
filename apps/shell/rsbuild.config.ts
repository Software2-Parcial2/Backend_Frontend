import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      // remoteVue usa Module Federation (se carga con loadRemote en tiempo de ejecucion).
      // remoteAngular usa Native Federation y se carga con el orquestador (src/remotes).
      remotes: {
        remoteVue: 'remoteVue@http://localhost:5175/mf-manifest.json',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
  ],
  tools: {
    rspack: {
      module: {
        rules: [
          {
            // El orquestador de Native Federation y es-module-shims hacen import(url) con URLs de los remotos en
            // tiempo de ejecucion: debe quedar como import() nativo y no como modulo de contexto.
            test: /(native-federation-orchestrator|es-module-shims)[\\/].*\.m?js$/,
            parser: { importDynamic: false },
          },
        ],
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
