// Genera src/<servicio>.d.ts desde contracts/openapi/<servicio>.json y un indice.
// `--check` falla si los tipos versionados no coinciden con los contratos (deriva).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..', '..');
const contratos = join(raiz, 'contracts', 'openapi');
const salida = join(aqui, '..', 'src');
const check = process.argv.includes('--check');
const bin = join(aqui, '..', 'node_modules', '.bin', 'openapi-typescript');

mkdirSync(salida, { recursive: true });
const servicios = readdirSync(contratos).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const cambios = [];

for (const s of servicios) {
  const destino = join(salida, `${s}.d.ts`);
  const antes = existsSync(destino) ? readFileSync(destino, 'utf8') : null;
  execFileSync(bin, [join(contratos, `${s}.json`), '-o', destino], { stdio: 'pipe' });
  const despues = readFileSync(destino, 'utf8');
  if (antes !== despues) cambios.push(s);
}

const indice = [
  '// Generado por scripts/generate.mjs. No editar.',
  ...servicios.map((s) => `export type { paths as ${camel(s)}Paths, components as ${camel(s)}Components } from './${s}.js';`),
  '',
].join('\n');
const indiceDestino = join(salida, 'index.d.ts');
if ((existsSync(indiceDestino) ? readFileSync(indiceDestino, 'utf8') : '') !== indice) cambios.push('index');
writeFileSync(indiceDestino, indice);

function camel(nombre) {
  return nombre.replace(/-(\w)/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
}

if (check && cambios.length) {
  console.error(`Los tipos de api-types estan desactualizados (${cambios.join(', ')}). Ejecuta: pnpm --filter @sigec/api-types generate`);
  process.exit(1);
}
console.log(`api-types: ${servicios.length} servicios${cambios.length ? `, actualizados: ${cambios.join(', ')}` : ', sin cambios'}`);
