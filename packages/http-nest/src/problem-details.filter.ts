import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { CODIGO_POR_ESTADO, type ErrorCampo, PROBLEM_JSON, type ProblemDetails } from './problem.js';

interface Req {
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  headersSent?: boolean;
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  send(body: unknown): void;
}

const TITULO_POR_ESTADO: Record<number, string> = {
  400: 'Solicitud invalida',
  401: 'No autenticado',
  403: 'Acceso denegado',
  404: 'No encontrado',
  409: 'Conflicto',
  422: 'Regla de negocio incumplida',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

/** "pacienteId must be a UUID" -> { campo: 'pacienteId', mensaje: 'pacienteId must be a UUID' }. */
function aErrorCampo(mensaje: string): ErrorCampo {
  const m = /^(?:property\s+)?([A-Za-z_][\w.[\]]*)\s/.exec(mensaje);
  return { campo: m?.[1] ?? '', mensaje };
}

function cabecera(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Convierte cualquier excepcion en `application/problem+json`. Reconoce tres formas:
 * 1) ya problem (ProblemException o los errores de idempotencia), 2) la de Nest (`{statusCode, message, error}`),
 * incluida la lista de errores de class-validator, y 3) errores no controlados (500 sin filtrar detalles).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    if (host.getType() !== 'http') throw exception;
    const req = http.getRequest<Req>();
    const res = http.getResponse<Res>();
    const problema = this.construir(exception, req);
    if (problema.status >= 500) {
      this.logger.error(`${problema.status} ${req.originalUrl ?? req.url ?? ''}`, exception instanceof Error ? exception.stack : String(exception));
    }
    if (res.headersSent) return;
    res.setHeader('Content-Type', PROBLEM_JSON);
    res.status(problema.status).send(problema);
  }

  private construir(exception: unknown, req: Req): ProblemDetails {
    const correlationId = cabecera(req.headers['x-correlation-id']);
    const instance = req.originalUrl ?? req.url;
    if (!(exception instanceof HttpException)) {
      return { type: 'about:blank', title: TITULO_POR_ESTADO[500], status: 500, detail: 'Ocurrio un error inesperado', code: 'ERROR_INTERNO', instance, correlationId };
    }
    const status = exception.getStatus();
    const cuerpo = exception.getResponse();
    const base: ProblemDetails = { type: 'about:blank', title: TITULO_POR_ESTADO[status] ?? 'Error', status, detail: exception.message, code: CODIGO_POR_ESTADO[status] ?? 'ERROR', instance, correlationId };
    if (typeof cuerpo === 'string') return { ...base, detail: cuerpo };
    const b = cuerpo as Record<string, unknown>;
    // Ya es problem+json (idempotencia, ProblemException): se respeta y solo se completa.
    if (typeof b['title'] === 'string' && typeof b['detail'] === 'string') {
      return { ...base, ...(b as Partial<ProblemDetails>), status, code: (b['code'] as string) ?? base.code, instance, correlationId };
    }
    // Forma de Nest: {statusCode, message, error}; message puede ser una lista (class-validator).
    const mensaje = b['message'];
    if (Array.isArray(mensaje)) {
      const errors = mensaje.map((m) => aErrorCampo(String(m)));
      return { ...base, status, title: 'Solicitud invalida', detail: 'Hay campos que no cumplen las reglas', code: 'VALIDACION', errors };
    }
    return { ...base, detail: typeof mensaje === 'string' ? mensaje : base.detail, title: typeof b['error'] === 'string' ? (TITULO_POR_ESTADO[status] ?? (b['error'] as string)) : base.title };
  }
}
