import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { catchError, from, map, mergeMap, type Observable, of, throwError } from 'rxjs';
import { requestHash } from './hash.js';
import { type IdempotencyDecision, IdempotencyService } from './idempotency.service.js';

export const IDEMPOTENCY_SERVICE = Symbol('SIGEC_IDEMPOTENCY_SERVICE');

interface Req {
  method: string;
  originalUrl?: string;
  url: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  user?: { sub?: string };
}
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
}

const PROBLEM = 'application/problem+json';

function problem(status: number, title: string, detail: string) {
  return new HttpException({ type: 'about:blank', title, status, detail }, status);
}

const HTTP_CODE_METADATA = '__httpCode__';

/** Codigo HTTP final del endpoint (@HttpCode o el valor por defecto de Nest: 201 en POST, 200 en el resto). */
function successStatus(context: ExecutionContext, method: string): number {
  const declared = Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as number | undefined;
  return declared ?? (method.toUpperCase() === 'POST' ? 201 : 200);
}

/**
 * Aplica contracts/idempotency.md. Va despues de los guards, asi que solo reserva claves de usuarios autenticados.
 * Al reproducir una respuesta guardada, el codigo HTTP es el del endpoint (p. ej. 201/202) si fue exitosa, o el del
 * error original (4xx) si fue un error.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_SERVICE) private readonly service: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Req>();
    const res = http.getResponse<Res>();
    const scope = req.user?.sub ?? 'anon';
    const hash = requestHash(req.method, req.originalUrl ?? req.url, req.body);
    const header = req.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;

    return from(this.service.begin(scope, key, hash)).pipe(
      mergeMap((decision: IdempotencyDecision) => {
        switch (decision.kind) {
          case 'invalid-key':
            res.setHeader('Content-Type', PROBLEM);
            return throwError(() => problem(400, 'Idempotency-Key requerida', decision.detail));
          case 'mismatch':
            res.setHeader('Content-Type', PROBLEM);
            return throwError(() =>
              problem(422, 'Idempotency-Key reutilizada', 'La misma clave se uso con una peticion distinta'),
            );
          case 'in-progress':
            res.setHeader('Retry-After', '1');
            res.setHeader('Content-Type', PROBLEM);
            return throwError(() => problem(409, 'Peticion en proceso', 'La peticion original sigue procesandose'));
          case 'replay': {
            res.setHeader('Idempotent-Replay', 'true');
            const { statusCode, body } = decision.response;
            if (statusCode >= 400) return throwError(() => new HttpException(body as object, statusCode));
            return of(body);
          }
          case 'proceed':
            return next.handle().pipe(
              // Se espera a que la respuesta quede guardada ANTES de contestar: asi una repeticion inmediata no ve PROCESANDO.
              mergeMap((body) =>
                from(
                  this.service.finish(decision.storageKey, { statusCode: successStatus(context, req.method), body }),
                ).pipe(map(() => body)),
              ),
              catchError((err: unknown) => {
                if (err instanceof HttpException && err.getStatus() < 500) {
                  const body = err.getResponse();
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  return from(this.service.finish(decision.storageKey, { statusCode: err.getStatus(), body })).pipe(
                    mergeMap(() => throwError(() => err)),
                  );
                }
                return from(this.service.abort(decision.storageKey)).pipe(mergeMap(() => throwError(() => err)));
              }),
            );
        }
      }),
    );
  }
}

/** Exige y gestiona Idempotency-Key en el handler o controlador. */
export const Idempotent = () => UseInterceptors(IdempotencyInterceptor);

export { PROBLEM };
