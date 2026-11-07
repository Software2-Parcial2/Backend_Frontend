/** Un campo que no cumplio las reglas (400 VALIDACION). */
export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

/** Cuerpo `application/problem+json` de SIGEC (docs/api.md). */
export interface Problema {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: ErrorCampo[];
  instance?: string;
  correlationId?: string;
  /** Solo en 409 VERSION_CONFLICTO: la version que tiene ahora el servidor. */
  versionVigente?: number;
  [extension: string]: unknown;
}

const CODIGO_POR_ESTADO: Record<number, string> = {
  0: 'SIN_CONEXION',
  400: 'SOLICITUD_INVALIDA',
  401: 'NO_AUTENTICADO',
  403: 'PROHIBIDO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'REGLA_DE_NEGOCIO',
  429: 'DEMASIADAS_PETICIONES',
  500: 'ERROR_INTERNO',
  503: 'SERVICIO_NO_DISPONIBLE',
};

/**
 * Error de una llamada a la API. Siempre lleva `estado` (0 = no hubo respuesta: red caida o CORS), un `code` estable para decidir
 * en la interfaz y el `correlationId` para soporte. `mensaje` es texto legible para el usuario.
 */
export class ApiError extends Error {
  readonly estado: number;
  readonly code: string;
  readonly titulo: string | undefined;
  readonly detalle: string | undefined;
  readonly errores: ErrorCampo[];
  readonly correlationId: string | undefined;
  readonly versionVigente: number | undefined;
  readonly problema: Problema | undefined;

  constructor(estado: number, problema?: Problema, mensajeAlterno?: string, correlationIdLocal?: string) {
    const detalle = problema?.detail ?? mensajeAlterno;
    super(detalle || problema?.title || `Error ${estado}`);
    this.name = 'ApiError';
    this.estado = estado;
    this.code = problema?.code ?? CODIGO_POR_ESTADO[estado] ?? (estado >= 500 ? 'ERROR_INTERNO' : 'ERROR');
    this.titulo = problema?.title;
    this.detalle = detalle;
    this.errores = Array.isArray(problema?.errors) ? problema.errors : [];
    this.correlationId = problema?.correlationId ?? correlationIdLocal;
    this.versionVigente = typeof problema?.versionVigente === 'number' ? problema.versionVigente : undefined;
    this.problema = problema;
  }

  /** Mensaje de un campo concreto, para mostrarlo junto al input. */
  mensajeDe(campo: string): string | undefined {
    return this.errores.find((e) => e.campo === campo)?.mensaje;
  }
}

export const esApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const esSinConexion = (e: unknown): boolean => esApiError(e) && e.estado === 0;
export const esNoAutenticado = (e: unknown): boolean => esApiError(e) && e.estado === 401;
export const esProhibido = (e: unknown): boolean => esApiError(e) && e.estado === 403;
export const esNoEncontrado = (e: unknown): boolean => esApiError(e) && e.estado === 404;
export const esValidacion = (e: unknown): boolean => esApiError(e) && e.estado === 400 && e.code === 'VALIDACION';
export const esConflictoVersion = (e: unknown): boolean => esApiError(e) && e.code === 'VERSION_CONFLICTO';
export const esAbortado = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
