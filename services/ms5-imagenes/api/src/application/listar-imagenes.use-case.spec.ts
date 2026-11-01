import { ListarImagenesUseCase } from './listar-imagenes.use-case.js';

describe('ListarImagenesUseCase', () => {
  it('devuelve una lista vacia', () => {
    expect(new ListarImagenesUseCase().ejecutar()).toEqual([]);
  });
});
