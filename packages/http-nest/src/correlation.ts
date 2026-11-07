import { randomUUID } from 'node:crypto';

interface Req {
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  setHeader(name: string, value: string): void;
}

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Garantiza `X-Correlation-Id`: usa el que trae la peticion (lo genera el gateway) o crea uno, y lo devuelve en la respuesta.
 * Express: `app.use(correlationMiddleware)`.
 */
export function correlationMiddleware(req: Req, res: Res, next: () => void): void {
  const entrante = req.headers[CORRELATION_HEADER];
  const id = (Array.isArray(entrante) ? entrante[0] : entrante) || randomUUID();
  req.headers[CORRELATION_HEADER] = id;
  res.setHeader('X-Correlation-Id', id);
  next();
}
