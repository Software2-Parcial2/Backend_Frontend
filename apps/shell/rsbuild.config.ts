import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// Ambos remotos son Module Federation 2 y se cargan con loadRemote (src/remotes/loader.ts). Las URLs de sus manifiestos se cambian al
// compilar con PUBLIC_REMOTE_VUE_URL / PUBLIC_REMOTE_ANGULAR_URL (por defecto, los puertos de desarrollo).
const REMOTE_VUE = process.env.PUBLIC_REMOTE_VUE_URL ?? 'http://localhost:5175/mf-manifest.json';
const REMOTE_ANGULAR = process.env.PUBLIC_REMOTE_ANGULAR_URL ?? 'http://localhost:4201/mf-manifest.json';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      remotes: {
        remoteVue: `remoteVue@${REMOTE_VUE}`,
        remoteAngular: `remoteAngular@${REMOTE_ANGULAR}`,
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
  ],
  html: {
    title: 'SIGEC',
    tags: [
      { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
        },
      },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
