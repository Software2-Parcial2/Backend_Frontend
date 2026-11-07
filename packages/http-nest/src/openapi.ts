import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Ordena las claves de forma recursiva para que el archivo versionado sea estable entre ejecuciones. */
export function normalizarOpenApi(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizarOpenApi);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizarOpenApi(v)]),
    );
  }
  return valor;
}

/** Sube por los directorios hasta encontrar `contracts/openapi` (raiz del monorepo). */
export function carpetaContratos(desde: string = process.cwd()): string {
  let dir = resolve(desde);
  for (let i = 0; i < 8; i++) {
    const candidato = join(dir, 'contracts');
    if (existsSync(candidato)) return join(candidato, 'openapi');
    dir = dirname(dir);
  }
  throw new Error('No se encontro la carpeta contracts/ del monorepo');
}

export interface ResultadoContrato {
  ruta: string;
  actualizado: boolean;
}

/**
 * Compara el documento OpenAPI generado desde el codigo con `contracts/openapi/<nombre>.json`.
 * Con `OPENAPI_UPDATE=1` reescribe el archivo; sin esa variable lanza si hay diferencias (deriva de contrato).
 */
export function verificarContratoOpenApi(documento: unknown, nombre: string): ResultadoContrato {
  const ruta = join(carpetaContratos(), `${nombre}.json`);
  const nuevo = `${JSON.stringify(normalizarOpenApi(documento), null, 2)}\n`;
  if (process.env['OPENAPI_UPDATE'] === '1') {
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, nuevo);
    return { ruta, actualizado: true };
  }
  if (!existsSync(ruta)) {
    throw new Error(`Falta ${ruta}. Generalo con: OPENAPI_UPDATE=1 pnpm --filter ${nombre} test:e2e`);
  }
  if (readFileSync(ruta, 'utf8') !== nuevo) {
    throw new Error(`El contrato ${nombre} se desvio del codigo (${ruta}). Revisa el cambio y ejecuta: OPENAPI_UPDATE=1 pnpm --filter ${nombre} test:e2e`);
  }
  return { ruta, actualizado: false };
}
