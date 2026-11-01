import { createHash } from 'node:crypto';

/** JSON canonico: claves ordenadas, para que el orden de las claves no cambie la huella. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return '{}';
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** requestHash = SHA-256(METHOD + " " + rutaConQuery + "\n" + SHA-256(cuerpo canonico)). */
export function requestHash(method: string, pathWithQuery: string, body: unknown): string {
  const bodyHash = sha256(typeof body === 'string' ? body : canonicalJson(body));
  return sha256(`${method.toUpperCase()} ${pathWithQuery}\n${bodyHash}`);
}
