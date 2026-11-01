// Genera src/topology.generated.ts desde contracts/events/topology.json (fuente unica de la topologia).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../contracts/events/', import.meta.url);
const topology = JSON.parse(readFileSync(fileURLToPath(new URL('topology.json', root)), 'utf8'));
const out = fileURLToPath(new URL('../src/topology.generated.ts', import.meta.url));
writeFileSync(
  out,
  `// GENERADO por scripts/gen-contracts.mjs desde contracts/events/topology.json. No editar a mano.\n` +
    `export const TOPOLOGY = ${JSON.stringify(topology, null, 2)} as const;\n`,
);
console.log('topology.generated.ts actualizado');
