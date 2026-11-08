#!/usr/bin/env node
// Verificacion en navegador real de los frontends contra la pila completa (gateway + servicios + Keycloak).
//   node scripts/e2e-frontends/index.mjs shell|angular|vue|pwa [...]     (sin argumentos: todos)
// Requisitos: la pila arriba (scripts/dev-services.sh + docker compose), make seed, y cada frontend sirviendose
// (pnpm --filter shell dev, ng serve / build, vite...). Ver docs/frontends-conexion.md.
import { limpiarUsuariosE2E, resumen } from './harness.mjs';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  /* sin .env */
}
const escenarios = {
  shell: () => import('./shell.mjs').then((m) => m.shell()),
  angular: () => import('./angular.mjs').then((m) => m.angular()),
  pwa: () => import('./pwa.mjs').then((m) => m.pwa()),
  vue: () => import('./vue.mjs').then((m) => m.vue()),
};
const sobrantes = await limpiarUsuariosE2E().catch(() => 0);
if (sobrantes) console.log(`(se borraron ${sobrantes} usuario(s) e2e.* sobrantes de una corrida anterior)`);
const pedidos = process.argv.slice(2);
const cuales = pedidos.length ? pedidos : Object.keys(escenarios);
for (const c of cuales) {
  if (!escenarios[c]) {
    console.error(`Escenario desconocido: ${c}. Disponibles: ${Object.keys(escenarios).join(', ')}`);
    process.exit(2);
  }
  await escenarios[c]();
}
process.exit(resumen() ? 0 : 1);
