import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import type { DocumentoFuente, FuenteDocumentos } from '../../application/rag/ports.js';

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/** Lee los *.md de docs/rag (RAG_DOCS_DIR); ignora README.md. Solo ficheros dentro del directorio configurado. */
@Injectable()
export class DocumentosEnDisco implements FuenteDocumentos {
  private readonly dir = resolve(process.env.RAG_DOCS_DIR ?? join(RAIZ_REPO, 'docs', 'rag'));

  async listar(): Promise<DocumentoFuente[]> {
    const nombres = (await readdir(this.dir)).filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md').sort();
    return Promise.all(
      nombres.map(async (n) => {
        const ruta = resolve(this.dir, n);
        if (relative(this.dir, ruta).startsWith('..')) throw new Error('Ruta fuera del directorio de documentos');
        return { ruta: n, contenido: await readFile(ruta, 'utf-8') };
      }),
    );
  }
}
