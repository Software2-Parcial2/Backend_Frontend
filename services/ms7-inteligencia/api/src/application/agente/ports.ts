export interface HerramientaLlm {
  nombre: string;
  descripcion: string;
  /** JSON Schema de los argumentos. */
  esquema: Record<string, unknown>;
}

export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: Record<string, unknown>;
}

export type MensajeAgente =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto?: string; llamadas?: LlamadaHerramienta[] }
  | { rol: 'herramientas'; resultados: { id: string; nombre: string; contenido: string; error?: boolean }[] };

export interface RespuestaLlm {
  texto?: string;
  llamadas: LlamadaHerramienta[];
}

/** Puerto de salida hacia el proveedor de IA (Gemini, Claude o simulado). */
export interface LlmPort {
  readonly proveedor: string;
  readonly modelo: string;
  generar(entrada: { sistema: string; mensajes: MensajeAgente[]; herramientas: HerramientaLlm[]; senal: AbortSignal }): Promise<RespuestaLlm>;
}
export const LLM_PORT = Symbol('LLM_PORT');

export interface RegistroAuditoria {
  en: string;
  usuario: string;
  roles: string[];
  herramienta: string;
  argumentos: unknown;
  estado: 'ok' | 'error' | 'rechazada';
  detalle?: string;
  ms: number;
  bytes: number;
}
export interface AuditoriaPort {
  registrar(r: RegistroAuditoria): void;
  recientes(limite: number): RegistroAuditoria[];
}
export const AUDITORIA_PORT = Symbol('AUDITORIA_PORT');

export interface FragmentoPolitica {
  documento: string;
  seccion: string;
  version: string;
  texto: string;
  puntuacion: number;
}
/** Busqueda semantica de politicas (RAG, implementada en L4). */
export interface PoliticasPort {
  buscar(consulta: string, k: number): Promise<FragmentoPolitica[]>;
}
export const POLITICAS_PORT = Symbol('POLITICAS_PORT');
