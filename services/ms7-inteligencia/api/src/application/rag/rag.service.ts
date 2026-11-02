import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConsultaInvalidaError } from '../../domain/gestion.js';
import type { FragmentoPolitica, PoliticasPort } from '../agente/ports.js';
import { dividir, parsearDocumento } from './chunker.js';
import { EMBEDDINGS_PORT, RAG_FUENTE, RAG_REPO, type EmbeddingsPort, type FuenteDocumentos, type RagRepositorio } from './ports.js';

export interface OpcionesRag { chunkChars: number; solape: number; scoreMinimo: number }
export const OPCIONES_RAG = Symbol('OPCIONES_RAG');

export interface ResumenIndexacion {
  indexados: { ruta: string; fragmentos: number }[];
  sinCambios: string[];
  eliminados: string[];
  modelo: string | null;
}

/** Ingesta y busqueda semantica de los documentos administrativos. Implementa el puerto que usa la herramienta consultar_politicas. */
@Injectable()
export class RagService implements PoliticasPort {
  private readonly log = new Logger('Rag');

  constructor(
    @Inject(EMBEDDINGS_PORT) private readonly embeddings: EmbeddingsPort,
    @Inject(RAG_REPO) private readonly repo: RagRepositorio,
    @Inject(RAG_FUENTE) private readonly fuente: FuenteDocumentos,
    @Inject(OPCIONES_RAG) private readonly op: OpcionesRag,
  ) {}

  async reindexar(forzar = false): Promise<ResumenIndexacion> {
    const docs = await this.fuente.listar();
    const previos = new Map((await this.repo.documentos()).map((d) => [d.ruta, d]));
    const resumen: ResumenIndexacion = { indexados: [], sinCambios: [], eliminados: [], modelo: null };

    for (const d of docs) {
      const hash = createHash('sha256').update(d.contenido).digest('hex');
      const previo = previos.get(d.ruta);
      if (!forzar && previo?.hash === hash) {
        resumen.sinCambios.push(d.ruta);
        continue;
      }
      const parseado = parsearDocumento(d.ruta, d.contenido);
      const fragmentos = dividir(parseado.secciones, this.op.chunkChars, this.op.solape);
      if (fragmentos.length === 0) throw new ConsultaInvalidaError(`El documento ${d.ruta} no tiene contenido indexable`);
      const { modelo, vectores } = await this.embeddings.embed(fragmentos.map((f) => `${parseado.titulo}. ${f.seccion}. ${f.texto}`));
      await this.repo.guardar(
        { ruta: d.ruta, titulo: parseado.titulo, version: parseado.version, hash, modelo },
        fragmentos.map((f, i) => ({ ...f, embedding: vectores[i]! })),
      );
      resumen.indexados.push({ ruta: d.ruta, fragmentos: fragmentos.length });
      resumen.modelo = modelo;
      this.log.log(`Indexado ${d.ruta}: ${fragmentos.length} fragmentos`);
    }
    const vigentes = new Set(docs.map((d) => d.ruta));
    resumen.eliminados = [...previos.keys()].filter((r) => !vigentes.has(r));
    if (resumen.eliminados.length) await this.repo.eliminar(resumen.eliminados);
    return resumen;
  }

  /** Fragmentos mas similares a la pregunta; descarta los que no alcanzan el umbral para que el agente diga "no hay informacion". */
  async buscar(consulta: string, k: number): Promise<FragmentoPolitica[]> {
    const { vectores } = await this.embeddings.embed([consulta]);
    const hallados = await this.repo.buscar(vectores[0]!, k);
    return hallados.filter((f) => f.puntuacion >= this.op.scoreMinimo).map((f) => ({ ...f, puntuacion: Math.round(f.puntuacion * 1000) / 1000 }));
  }

  estado() {
    return this.repo.estadisticas();
  }
}
