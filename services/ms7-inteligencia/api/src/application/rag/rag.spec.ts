import { describe, expect, it, vi } from 'vitest';
import type { FragmentoPolitica } from '../agente/ports.js';
import { dividir, parsearDocumento } from './chunker.js';
import type { DocumentoIndexado, EmbeddingsPort, FuenteDocumentos, RagRepositorio } from './ports.js';
import { RagService } from './rag.service.js';

const DOC = `---
titulo: Politica de prueba
version: 9.9
---

> DOCUMENTO DE EJEMPLO FICTICIO. Aviso que no debe indexarse.

## Cancelacion

Se puede cancelar hasta 24 horas antes. Pasado ese plazo hay un cargo del 20 %.

## Reprogramacion

${'Cada cita admite dos reprogramaciones sin costo y debe solicitarse con antelacion suficiente. '.repeat(12)}
`;

describe('chunker', () => {
  it('lee la cabecera, ignora el aviso de ejemplo y divide por secciones', () => {
    const d = parsearDocumento('x.md', DOC);
    expect(d).toMatchObject({ titulo: 'Politica de prueba', version: '9.9' });
    expect(d.secciones.map((s) => s.titulo)).toEqual(['Cancelacion', 'Reprogramacion']);
    expect(d.secciones[0]!.texto).not.toContain('DOCUMENTO DE EJEMPLO');
  });
  it('sin cabecera usa el nombre y una version por defecto', () => {
    expect(parsearDocumento('a.md', '## S\ntexto')).toMatchObject({ titulo: 'a.md', version: 'sin-version' });
  });
  it('fragmenta con solapamiento, respeta el maximo y conserva la seccion', () => {
    const f = dividir(parsearDocumento('x.md', DOC).secciones, 300, 60);
    expect(f.length).toBeGreaterThan(3);
    expect(f.every((x) => x.texto.length <= 300)).toBe(true);
    expect(f.filter((x) => x.seccion === 'Reprogramacion').length).toBeGreaterThan(2);
    expect(f.map((x) => x.orden)).toEqual(f.map((_, i) => i));
    const rep = f.filter((x) => x.seccion === 'Reprogramacion');
    // solapamiento: el inicio de un fragmento aparece al final del anterior
    expect(rep[0]!.texto.includes(rep[1]!.texto.slice(0, 20))).toBe(true);
  });
  it('una seccion corta queda en un solo fragmento', () => {
    expect(dividir([{ titulo: 'S', texto: 'corto' }])).toEqual([{ seccion: 'S', orden: 0, texto: 'corto' }]);
  });
  it('rechaza solapes absurdos', () => {
    expect(() => dividir([{ titulo: 'S', texto: 'x' }], 100, 60)).toThrow();
  });
});

function montar(docs: { ruta: string; contenido: string }[], previos: DocumentoIndexado[] = [], hallados: FragmentoPolitica[] = []) {
  const embed = vi.fn(async (t: string[]) => ({ modelo: 'm', vectores: t.map(() => [1, 0]) }));
  const guardar = vi.fn(async () => undefined);
  const eliminar = vi.fn(async () => undefined);
  const repo: RagRepositorio = { documentos: async () => previos, guardar, eliminar, buscar: async () => hallados, estadisticas: async () => ({ documentos: 0, fragmentos: 0 }) };
  const fuente: FuenteDocumentos = { listar: async () => docs };
  const emb: EmbeddingsPort = { embed };
  return { rag: new RagService(emb, repo, fuente, { chunkChars: 300, solape: 60, scoreMinimo: 0.4 }), embed, guardar, eliminar };
}

describe('RagService', () => {
  it('indexa documentos nuevos y no reindexa los que no cambiaron (hash)', async () => {
    const a = montar([{ ruta: 'a.md', contenido: DOC }]);
    const r1 = await a.rag.reindexar();
    expect(r1.indexados[0]).toMatchObject({ ruta: 'a.md' });
    expect(a.guardar).toHaveBeenCalledTimes(1);
    const hash = (a.guardar.mock.calls[0] as unknown as [{ hash: string }])[0].hash;
    const b = montar([{ ruta: 'a.md', contenido: DOC }], [{ ruta: 'a.md', hash, version: '9.9', modelo: 'm' }]);
    const r2 = await b.rag.reindexar();
    expect(r2.sinCambios).toEqual(['a.md']);
    expect(b.guardar).not.toHaveBeenCalled();
    expect((await montar([{ ruta: 'a.md', contenido: DOC }], [{ ruta: 'a.md', hash, version: '9.9', modelo: 'm' }]).rag.reindexar(true)).indexados).toHaveLength(1);
  });
  it('elimina del indice los documentos que ya no existen', async () => {
    const m = montar([], [{ ruta: 'viejo.md', hash: 'x', version: '1', modelo: 'm' }]);
    expect((await m.rag.reindexar()).eliminados).toEqual(['viejo.md']);
    expect(m.eliminar).toHaveBeenCalledWith(['viejo.md']);
  });
  it('el texto vectorizado incluye titulo y seccion (contexto) para mejorar la recuperacion', async () => {
    const m = montar([{ ruta: 'a.md', contenido: DOC }]);
    await m.rag.reindexar();
    expect((m.embed.mock.calls[0]![0] as string[])[0]).toMatch(/^Politica de prueba\. Cancelacion\./);
  });
  it('un documento sin contenido indexable falla con un error claro', async () => {
    await expect(montar([{ ruta: 'v.md', contenido: '---\ntitulo: x\n---\n' }]).rag.reindexar()).rejects.toThrow(/no tiene contenido/);
  });
  it('la busqueda descarta fragmentos bajo el umbral (para poder decir "no hay informacion")', async () => {
    const f = (puntuacion: number): FragmentoPolitica => ({ documento: 'd', seccion: 's', version: '1', texto: 't', puntuacion });
    const m = montar([], [], [f(0.81234), f(0.39), f(0.4)]);
    expect((await m.rag.buscar('pregunta', 3)).map((x) => x.puntuacion)).toEqual([0.812, 0.4]);
  });
});
