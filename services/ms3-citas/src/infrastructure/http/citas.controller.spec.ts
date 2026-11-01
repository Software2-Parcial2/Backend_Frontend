import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@sigec/auth-nest';
import { CitasController } from './citas.controller.js';
import type { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import type { CitaAggregate } from '../../domain/cita.js';

const PACIENTE = 'a0000000-0000-4000-8000-000000000001';
const OTRO = 'b0000000-0000-4000-8000-000000000002';
const cita = (pacienteId: string) =>
  ({ citaId: 'c1', input: { pacienteId, medicoId: 'm', especialidad: 'g', fechaHora: '2026-12-01T10:00:00.000Z' }, estado: 'RESERVADA', notificacion: { estado: 'NO_APLICA', intentos: 0 }, createdAt: 1, updatedAt: 1, version: 0,
    saga: { sagaId: 's', estado: 'EN_CURSO', paso: 'COBRO_PROVISIONAL', intentos: 1, deadline: 5, cobroSolicitado: true, compensaciones: [], historial: [] } }) as unknown as CitaAggregate;

const paciente: AuthUser = { sub: 'u', roles: ['paciente'], pacienteId: PACIENTE };
const recepcion: AuthUser = { sub: 'r', roles: ['recepcion'] };

function setup(citas: CitaAggregate[] = [cita(PACIENTE)]) {
  const calls: unknown[] = [];
  const saga = {
    obtener: async (id: string) => citas.find((c) => c.citaId === id) ?? null,
    buscar: async (f: unknown) => (calls.push(f), { items: citas, siguiente: null }),
    solicitar: async () => ({ citaId: 'x', sagaId: 'y' }),
  } as unknown as CitaSagaService;
  return { controller: new CitasController(saga), calls };
}

describe('CitasController - autorizacion por rol', () => {
  it('un paciente solo lista sus citas: el filtro se fuerza a su pacienteId', async () => {
    const { controller, calls } = setup();
    await controller.listar({}, paciente);
    expect(calls[0]).toMatchObject({ pacienteId: PACIENTE });
  });

  it('un paciente no puede pedir las citas de otro paciente ni la agenda de un medico', async () => {
    const { controller } = setup();
    await expect(controller.listar({ pacienteId: OTRO }, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.listar({ medicoId: 'm' }, paciente)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un paciente sin pacienteId vinculado recibe 403', async () => {
    const { controller } = setup();
    await expect(controller.listar({}, { sub: 'u', roles: ['paciente'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un paciente ve su cita pero la ajena responde 404 (no revela que existe)', async () => {
    const { controller } = setup([cita(OTRO)]);
    await expect(controller.obtener('c1', paciente)).rejects.toBeInstanceOf(NotFoundException);
    const propia = setup([cita(PACIENTE)]);
    await expect(propia.controller.obtener('c1', paciente)).resolves.toMatchObject({ citaId: 'c1' });
  });

  it('un paciente solo puede pedir cita para si mismo', async () => {
    const { controller } = setup();
    const dto = { pacienteId: OTRO, medicoId: 'm', especialidad: 'g', fechaHora: '2026-12-01T10:00:00Z' };
    await expect(controller.crear(dto, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.crear({ ...dto, pacienteId: PACIENTE }, paciente)).resolves.toMatchObject({ citaId: 'x' });
  });

  it('recepcion, medico y administrador ven todo y pueden filtrar libremente', async () => {
    const { controller, calls } = setup([cita(OTRO)]);
    await controller.listar({ pacienteId: OTRO }, recepcion);
    expect(calls[0]).toMatchObject({ pacienteId: OTRO });
    await expect(controller.obtener('c1', recepcion)).resolves.toMatchObject({ pacienteId: OTRO });
    await controller.listar({}, { sub: 'm', roles: ['medico'] });
    expect(calls[1]).toMatchObject({ pacienteId: undefined });
  });

  it('un usuario con rol paciente Y de personal no queda restringido', async () => {
    const { controller } = setup([cita(OTRO)]);
    await expect(controller.obtener('c1', { sub: 'x', roles: ['paciente', 'recepcion'] })).resolves.toBeDefined();
  });
});
