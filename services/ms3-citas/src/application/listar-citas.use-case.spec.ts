import { ListarCitasUseCase } from './listar-citas.use-case.js';

describe('ListarCitasUseCase', () => {
  it('devuelve una lista vacia', () => {
    expect(new ListarCitasUseCase().ejecutar()).toEqual([]);
  });
});
