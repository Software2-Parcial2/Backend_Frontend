import { HttpException } from '@nestjs/common';

/** Error de campo en una validacion fallida. */
export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/** RFC 7807 con extensiones de SIGEC (`code` estable, `errors`, `correlationId`). Ver docs/api.md. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  errors?: ErrorCampo[];
  correlationId?: string;
  [extension: string]: unknown;
}

export const PROBLEM_JSON = 'application/problem+json';

/** Codigo estable por defecto segun el estado HTTP; los casos de negocio pasan su propio `code`. */
export const CODIGO_POR_ESTADO: Record<number, string> = {
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'PROHIBIDO',
  404: 'NO_ENCONTRADO',
  405: 'METODO_NO_PERMITIDO',
  409: 'CONFLICTO',
  413: 'CUERPO_DEMASIADO_GRANDE',
  415: 'TIPO_NO_SOPORTADO',
  422: 'REGLA_DE_NEGOCIO',
  429: 'DEMASIADAS_PETICIONES',
  500: 'ERROR_INTERNO',
  502: 'SERVICIO_NO_DISPONIBLE',
  503: 'SERVICIO_NO_DISPONIBLE',
  504: 'TIEMPO_AGOTADO',
};

/** Excepcion de negocio con `code` estable. Ej.: `new ProblemException(409, 'HORARIO_OCUPADO', 'Horario ocupado', 'El horario ya no esta libre')`. */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    code: string,
    title: string,
    detail: string,
    extras: { errors?: ErrorCampo[]; [extension: string]: unknown } = {},
  ) {
    super({ type: 'about:blank', title, status, detail, code, ...extras }, status);
  }
}
