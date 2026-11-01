import { ListarNotificacionesUseCase } from './listar-notificaciones.use-case.js';

describe('ListarNotificacionesUseCase', () => {
  it('devuelve una lista vacia', () => {
    expect(new ListarNotificacionesUseCase().ejecutar()).toEqual([]);
  });
});
