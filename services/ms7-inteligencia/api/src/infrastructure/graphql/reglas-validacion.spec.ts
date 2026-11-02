import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import { limitarConsulta } from './reglas-validacion.js';

const schema = buildSchema(`type N { id: ID hijo: N } type Query { n: N }`);
const errores = (q: string, maxProfundidad = 3, maxComplejidad = 6) =>
  validate(schema, parse(q), [limitarConsulta({ maxProfundidad, maxComplejidad })]).map((e) => e.extensions?.code ?? e.message);

describe('limitarConsulta', () => {
  it('acepta una consulta dentro de los limites', () => {
    expect(errores('{ n { id hijo { id } } }')).toEqual([]);
  });
  it('rechaza consultas demasiado profundas', () => {
    expect(errores('{ n { hijo { hijo { hijo { id } } } } }')).toEqual(['CONSULTA_DEMASIADO_PROFUNDA']);
  });
  it('cuenta alias repetidos como complejidad', () => {
    expect(errores('{ a: n { id } b: n { id } c: n { id } d: n { id } }', 6, 6)).toEqual(['CONSULTA_DEMASIADO_COMPLEJA']);
  });
  it('expande fragmentos (no permite esquivar el limite)', () => {
    expect(errores('query { n { ...f } } fragment f on N { hijo { hijo { hijo { id } } } }')).toEqual(['CONSULTA_DEMASIADO_PROFUNDA']);
  });
  it('no cuenta la introspeccion minima (__typename)', () => {
    expect(errores('{ n { __typename id } }', 3, 2)).toEqual([]);
  });
});
