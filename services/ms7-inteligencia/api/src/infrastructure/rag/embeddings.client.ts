import { Injectable } from '@nestjs/common';
import type { EmbeddingsPort } from '../../application/rag/ports.js';
import { ServicioNoDisponibleError } from '../../domain/gestion.js';
import { postJson, type OpcionesHttp } from '../clients/http-json.js';

const LOTE = 32;

@Injectable()
export class EmbeddingsHttpClient implements EmbeddingsPort {
  private readonly op: OpcionesHttp = {
    servicio: 'MS7 embeddings',
    baseUrl: process.env.EMBEDDINGS_URL ?? 'http://localhost:8027',
    timeoutMs: Number(process.env.EMBEDDINGS_TIMEOUT_MS ?? 60_000), // la primera llamada puede tardar mientras carga el modelo
  };

  async embed(textos: string[]): Promise<{ modelo: string; vectores: number[][] }> {
    const cab: Record<string, string> = process.env.EMBEDDINGS_API_KEY ? { 'X-Api-Key': process.env.EMBEDDINGS_API_KEY } : {};
    const vectores: number[][] = [];
    let modelo = '';
    for (let i = 0; i < textos.length; i += LOTE) {
      const r = await postJson<{ modelo: string; dimension: number; vectores: number[][] }>(this.op, '/embed', { textos: textos.slice(i, i + LOTE) }, cab);
      if (r.dimension !== 384) throw new ServicioNoDisponibleError(this.op.servicio, `dimension ${r.dimension} incompatible con la tabla (384): requiere una migracion nueva`);
      modelo = r.modelo;
      vectores.push(...r.vectores);
    }
    return { modelo, vectores };
  }
}
