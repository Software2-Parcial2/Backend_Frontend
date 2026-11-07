import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@sigec/auth-nest';
import { ProblemException } from '@sigec/http-nest';
import { CitasController } from './citas.controller.js';
import type { AgendaService } from '../../application/horarios/agenda.service.js';
import { HorarioNoDisponibleError, TransicionInvalidaError, CitaNoEncontradaError } from '../../domain/cita.js';
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
    disponibilidad: async (f: unknown) => (calls.push(f), { items: [{ medicoId: 'm', fechaHora: '2026-12-01T10:00:00.000Z', estado: 'CONFIRMADO', citaId: 'c9' }, { medicoId: 'm', fechaHora: '2026-12-01T11:00:00.000Z', estado: 'LIBRE' }], siguiente: 'sig' }),
  } as unknown as CitaSagaService;
  return { controller: new CitasController(saga, {} as AgendaService), calls };
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

  it('disponibilidad: normaliza el rango, no expone citaId y traduce CONFIRMADO a OCUPADO', async () => {
    const { controller, calls } = setup();
    const r = await controller.disponibilidad({ medicoId: 'm', desde: '2026-12-01', hasta: '2026-12-02T00:00:00Z', soloLibres: true });
    expect(calls[0]).toEqual({ medicoId: 'm', desde: '2026-12-01T00:00:00.000Z', hasta: '2026-12-02T00:00:00.000Z', soloLibres: true });
    expect(r).toEqual({ items: [{ fechaHora: '2026-12-01T10:00:00.000Z', estado: 'OCUPADO' }, { fechaHora: '2026-12-01T11:00:00.000Z', estado: 'LIBRE' }], siguiente: 'sig' });
  });

  it('disponibilidad: rango invertido responde 400', async () => {
    const { controller } = setup();
    await expect(controller.disponibilidad({ medicoId: 'm', desde: '2026-12-02', hasta: '2026-12-01' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('CitasController - ciclo de vida de la cita', () => {
  const confirmada = (pacienteId: string) => ({ ...cita(pacienteId), estado: 'CANCELADA_USUARIO', cancelacion: { motivo: 'x', por: 'r', at: 5 } }) as unknown as CitaAggregate;

  function conSaga(over: Record<string, unknown>) {
    const base = { obtener: async () => cita(PACIENTE), buscar: async () => ({ items: [], siguiente: null }) };
    const saga = { ...base, ...over } as unknown as CitaSagaService;
    return new CitasController(saga, {} as AgendaService);
  }
  const codigo = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ProblemException);
      return { status: (e as ProblemException).getStatus(), code: ((e as ProblemException).getResponse() as { code: string }).code };
    }
    throw new Error('no fallo');
  };

  it('cancelar devuelve la cita cancelada y pasa el motivo y quien la cancela', async () => {
    const llamadas: unknown[][] = [];
    const c = conSaga({ cancelar: async (...a: unknown[]) => (llamadas.push(a), confirmada(PACIENTE)) });
    const r = await c.cancelar('11111111-1111-4111-8111-111111111111', { motivo: 'Pedido del paciente' }, { ...recepcion, username: 'rosa' });
    expect(r).toMatchObject({ estado: 'CANCELADA_USUARIO', cancelacion: { motivo: 'x' } });
    expect(llamadas[0]).toEqual(['11111111-1111-4111-8111-111111111111', 'Pedido del paciente', 'rosa']);
  });

  it('un paciente no puede cancelar ni reprogramar la cita de otro (404, no revela que existe)', async () => {
    const c = conSaga({ obtener: async () => cita(OTRO) });
    await expect(c.cancelar('11111111-1111-4111-8111-111111111111', { motivo: 'x' }, paciente)).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.reprogramar('11111111-1111-4111-8111-111111111111', { fechaHora: '2026-12-02T10:00:00Z' }, paciente)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('traduce los errores de dominio a problem+json con code estable', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const fallos: Array<[unknown, number, string]> = [
      [new TransicionInvalidaError('CITA_EN_PROCESO', 'x'), 409, 'CITA_EN_PROCESO'],
      [new TransicionInvalidaError('CITA_YA_CANCELADA', 'x'), 409, 'CITA_YA_CANCELADA'],
      [new TransicionInvalidaError('CITA_PASADA', 'x'), 422, 'CITA_PASADA'],
      [new HorarioNoDisponibleError('m', 'f'), 409, 'HORARIO_OCUPADO'],
      [new CitaNoEncontradaError(id), 404, 'CITA_NO_ENCONTRADA'],
    ];
    for (const [error, status, code] of fallos) {
      const c = conSaga({ cancelar: async () => { throw error; }, reprogramarCita: async () => { throw error; } });
      expect(await codigo(c.cancelar(id, { motivo: 'x' }, recepcion))).toEqual({ status, code });
      expect(await codigo(c.reprogramar(id, { fechaHora: '2026-12-02T10:00:00Z' }, recepcion))).toEqual({ status, code });
    }
  });

  it('asistencia pasa la accion y el usuario; los errores de transicion son 409', async () => {
    const llamadas: unknown[][] = [];
    const c = conSaga({ registrarAsistencia: async (...a: unknown[]) => (llamadas.push(a), cita(PACIENTE)) });
    await c.asistencia('11111111-1111-4111-8111-111111111111', { accion: 'LLEGO' }, { sub: 'm', username: 'dra', roles: ['medico'] });
    expect(llamadas[0]).toEqual(['11111111-1111-4111-8111-111111111111', 'LLEGO', 'dra']);
    const malo = conSaga({ registrarAsistencia: async () => { throw new TransicionInvalidaError('ASISTENCIA_INVALIDA', 'x'); } });
    expect(await codigo(malo.asistencia('11111111-1111-4111-8111-111111111111', { accion: 'ATENDIDA' }, recepcion))).toEqual({ status: 409, code: 'ASISTENCIA_INVALIDA' });
  });

  it('listar acepta el filtro por estado y lo pasa al repositorio', async () => {
    const { controller, calls } = setup();
    await controller.listar({ estado: 'RESERVADA' }, recepcion);
    expect(calls[0]).toMatchObject({ estado: 'RESERVADA' });
  });

  it('historial: un paciente solo ve el de su cita', async () => {
    const llamadas: string[] = [];
    const agenda = { historial: async (id: string) => (llamadas.push(id), { citaId: id }) } as unknown as AgendaService;
    const saga = { obtener: async () => cita(OTRO) } as unknown as CitaSagaService;
    await expect(new CitasController(saga, agenda).historial('11111111-1111-4111-8111-111111111111', paciente)).rejects.toBeInstanceOf(NotFoundException);
    const propia = new CitasController({ obtener: async () => cita(PACIENTE) } as unknown as CitaSagaService, agenda);
    await expect(propia.historial('11111111-1111-4111-8111-111111111111', paciente)).resolves.toEqual({ citaId: '11111111-1111-4111-8111-111111111111' });
  });

  it('resumen valida el rango y delega en la agenda', async () => {
    const agenda = { resumen: async (...a: unknown[]) => ({ args: a }) } as unknown as AgendaService;
    const c = new CitasController({} as CitaSagaService, agenda);
    await expect(c.resumen({ desde: '2026-11-01', hasta: '2026-11-30', agruparPor: 'medico' })).resolves.toEqual({ args: ['2026-11-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z', 'medico'] });
    expect(await codigo(c.resumen({ desde: '2026-12-01', hasta: '2026-11-01' }))).toEqual({ status: 400, code: 'SOLICITUD_INVALIDA' });
  });
});
