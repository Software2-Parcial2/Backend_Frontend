// Genera src/topology.generated.ts desde contracts/events/topology.json (fuente unica de la topologia).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Todos los JSON Schemas del contrato se embeben para validar en tiempo de ejecucion (Ajv).
const dir = fileURLToPath(root);
const schemas = readdirSync(dir)
  .filter((f) => f.endsWith('.schema.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${dir}${f}`, 'utf8')));
writeFileSync(
  fileURLToPath(new URL('../src/schemas.generated.ts', import.meta.url)),
  `// GENERADO por scripts/gen-contracts.mjs desde contracts/events/*.schema.json. No editar a mano.\n` +
    `export const SCHEMAS: readonly Record<string, unknown>[] = ${JSON.stringify(schemas, null, 2)};\n`,
);
console.log(`schemas.generated.ts: ${schemas.length} schemas`);
