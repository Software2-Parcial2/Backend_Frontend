import type { FragmentoPolitica } from '../agente/ports.js';
import type { Fragmento } from './chunker.js';

export const EMBEDDINGS_PORT = Symbol('EMBEDDINGS_PORT');
export const RAG_REPO = Symbol('RAG_REPO');
export const RAG_FUENTE = Symbol('RAG_FUENTE');

export interface EmbeddingsPort {
  /** Vectores L2-normalizados (coseno = producto punto). */
  embed(textos: string[]): Promise<{ modelo: string; vectores: number[][] }>;
}

export interface DocumentoFuente { ruta: string; contenido: string }
export interface FuenteDocumentos { listar(): Promise<DocumentoFuente[]> }

export interface DocumentoIndexado { ruta: string; hash: string; version: string; modelo: string }

export interface RagRepositorio {
  documentos(): Promise<DocumentoIndexado[]>;
  /** Reemplaza (transaccionalmente) los fragmentos de un documento. */
  guardar(doc: { ruta: string; titulo: string; version: string; hash: string; modelo: string }, fragmentos: (Fragmento & { embedding: number[] })[]): Promise<void>;
  eliminar(rutas: string[]): Promise<void>;
  buscar(embedding: number[], k: number): Promise<FragmentoPolitica[]>;
  estadisticas(): Promise<{ documentos: number; fragmentos: number }>;
}
