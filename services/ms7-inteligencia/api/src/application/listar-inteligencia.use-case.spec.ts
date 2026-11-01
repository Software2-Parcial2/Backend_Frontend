import { ListarAnalisisUseCase } from './listar-inteligencia.use-case.js';

describe('ListarAnalisisUseCase', () => {
  it('devuelve una lista vacia', () => {
    expect(new ListarAnalisisUseCase().ejecutar()).toEqual([]);
  });
});
