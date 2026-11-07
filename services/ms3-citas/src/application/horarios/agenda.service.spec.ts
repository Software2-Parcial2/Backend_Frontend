import { describe, expect, it } from 'vitest';
import type { CitaAggregate, Horario } from '../../domain/cita.js';
import { aplicar, iniciar } from '../saga/saga-machine.js';
import { DEFAULT_POLICY } from '../saga/saga-policy.js';
import { cancelar, registrarAsistencia } from '../saga/ciclo-vida.js';
import { derivarPasos } from '../saga/historial.js';
import { AgendaService, construirCeldas } from './agenda.service.js';
import type { CitaRepository } from '../saga/cita-repository.js';
import type { AgendaRepository, PerfilMedico } from './agenda-repository.js';

const T0 = Date.parse('2026-11-03T12:00:00Z'); // 08:00 local
const deps = (now = T0) => ({ now, policy: DEFAULT_POLICY, random: () => 0, newId: (() => { let n = 0; return () => `id-${++n}`; })() });
const FECHA = '2026-11-10T14:00:00.000Z'; // 10:00 local del 10 nov

function cita(estado: 'RESERVADA' | 'CONFIRMADA' | 'EN_SALA' | 'CANCELADA_USUARIO', fechaHora = FECHA, medicoId = 'm1', pacienteId = 'p1'): CitaAggregate {
  let a = iniciar({ pacienteId, medicoId, especialidad: 'cardiologia', fechaHora }, deps()).aggregate;
  if (estado === 'RESERVADA') return a;
  a = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: 'f', monto: 180 }, deps())!.aggregate;
  a = aplicar(a, { type: 'NOTIFICACION_ENVIADA' }, deps())!.aggregate;
  if (estado === 'EN_SALA') return registrarAsistencia(a, 'LLEGO', 'u', deps()).aggregate;
  if (estado === 'CANCELADA_USUARIO') return cancelar(a, 'x', 'u', deps()).aggregate;
  return a;
}

describe('construirCeldas', () => {
  const horarios: Horario[] = [
    { medicoId: 'm1', fechaHora: '2026-11-10T12:00:00.000Z', estado: 'LIBRE' },
    { medicoId: 'm1', fechaHora: '2026-11-10T12:30:00.000Z', estado: 'BLOQUEADO', motivo: 'Reunion clinica' },
    { medicoId: 'm1', fechaHora: FECHA, estado: 'CONFIRMADO', citaId: 'x' },
    { medicoId: 'm1', fechaHora: '2026-11-10T14:30:00.000Z', estado: 'RESERVADO', citaId: 'y', reservaExpiraEn: Date.parse('2026-11-10T14:10:00Z') },
  ];
  const nombres = new Map([['p1', { pacienteId: 'p1', nombre: 'Carla Rojas Vaca', numeroHistoria: 'HC-004218' }]]);

  it('une horarios y citas: la cita manda, con el nombre del paciente, y la hora es LOCAL', () => {
    const celdas = construirCeldas(horarios, [cita('CONFIRMADA')], nombres);
    expect(celdas.map((c) => [c.hora, c.estado])).toEqual([['08:00', 'LIBRE'], ['08:30', 'BLOQUEADO'], ['10:00', 'CONFIRMADA'], ['10:30', 'RESERVA_TEMPORAL']]);
    const c = celdas[2];
    expect(c.paciente).toEqual({ id: 'p1', nombre: 'Carla Rojas Vaca', numeroHistoria: 'HC-004218' });
    expect(celdas[1].motivo).toBe('Reunion clinica');
    expect(celdas[3].reservaExpiraEn).toBe('2026-11-10T14:10:00.000Z');
  });

  it('muestra EN_SALA y omite las citas canceladas (su horario ya esta libre)', () => {
    expect(construirCeldas(horarios, [cita('EN_SALA')], nombres)[2].estado).toBe('EN_SALA');
    expect(construirCeldas(horarios.filter((h) => h.fechaHora !== FECHA), [cita('CANCELADA_USUARIO')], nombres)).toHaveLength(3);
  });

  it('una cita sin horario publicado (modo abierto) tambien aparece', () => {
    const celdas = construirCeldas([], [cita('CONFIRMADA'), cita('CONFIRMADA', '2026-11-10T13:00:00.000Z', 'm1', 'p2')], new Map());
    expect(celdas.map((c) => c.hora)).toEqual(['09:00', '10:00']);
    expect(celdas[0].paciente).toEqual({ id: 'p2', nombre: null, numeroHistoria: null });
  });
});

describe('derivarPasos', () => {
  it('cita confirmada: reserva, cobro y aviso completados, sin compensacion', () => {
    let a = iniciar({ pacienteId: 'p', medicoId: 'm', especialidad: 'e', fechaHora: FECHA }, deps()).aggregate;
    a = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: 'f', monto: 180 }, deps())!.aggregate;
    a = aplicar(a, { type: 'NOTIFICACION_ENVIADA' }, deps())!.aggregate;
    const { pasos, compensacion } = derivarPasos(a);
    expect(pasos.map((p) => [p.servicio, p.estado])).toEqual([['MS3', 'COMPLETADO'], ['MS6', 'COMPLETADO'], ['MS8', 'COMPLETADO']]);
    expect(compensacion).toBeNull();
  });

  it('SAGA con compensacion (cobro agotado): MS6 fallo, MS8 no se ejecuto y la reserva se compenso', () => {
    let a = iniciar({ pacienteId: 'p', medicoId: 'm', especialidad: 'e', fechaHora: FECHA }, deps()).aggregate;
    for (let i = 0; i < 3; i++) a = aplicar(a, { type: 'TIMEOUT' }, deps(a.saga.deadline! + 1))!.aggregate;
    expect(a.saga.estado).toBe('COMPENSADA');
    const { pasos, compensacion } = derivarPasos(a);
    expect(pasos.map((p) => [p.servicio, p.estado])).toEqual([['MS3', 'COMPENSADO'], ['MS6', 'FALLIDO'], ['MS8', 'NO_EJECUTADO']]);
    expect(compensacion?.acciones).toEqual(expect.arrayContaining(['LIBERAR_HORARIO']));
    expect(compensacion?.motivo).toMatch(/timeout/);
  });
});

describe('AgendaService', () => {
  const medicos: PerfilMedico[] = [
    { medicoId: 'm1', nombre: 'Dra. Valeria Antelo', especialidad: 'cardiologia', especialidadNombre: 'Cardiologia', consultorio: 'Cons. 3', activo: true, usuarioKeycloak: 'medico' },
    { medicoId: 'm2', nombre: 'Dr. Marcelo Suarez', especialidad: 'neumologia', especialidadNombre: 'Neumologia', consultorio: 'Cons. 5', activo: true },
    { medicoId: 'm3', nombre: 'Inactivo', especialidad: 'cardiologia', especialidadNombre: 'Cardiologia', activo: false },
  ];
  const citas: CitaAggregate[] = [cita('CONFIRMADA'), cita('EN_SALA', '2026-11-10T15:00:00.000Z', 'm1', 'p2'), cita('CANCELADA_USUARIO', '2026-11-10T16:00:00.000Z', 'm1', 'p3'), cita('CONFIRMADA', '2026-11-11T14:00:00.000Z', 'm1', 'p1'), cita('RESERVADA', FECHA, 'm2', 'p4')];
  const agenda = {
    listarMedicos: async () => medicos,
    perfilMedico: async (id: string) => medicos.find((m) => m.medicoId === id) ?? null,
    perfilesPaciente: async (ids: string[]) => new Map(ids.filter((i) => i === 'p1').map((i) => [i, { pacienteId: i, nombre: 'Carla Rojas Vaca', numeroHistoria: 'HC-004218' }])),
  } as unknown as AgendaRepository;
  const repo = {
    buscar: async (f: { medicoId?: string; desde?: number; hasta?: number }) => ({
      items: citas.filter((c) => (!f.medicoId || c.input.medicoId === f.medicoId) && (f.desde === undefined || Date.parse(c.input.fechaHora) >= f.desde) && (f.hasta === undefined || Date.parse(c.input.fechaHora) <= f.hasta)),
      siguiente: null,
    }),
    disponibilidad: async () => ({ items: [] as Horario[], siguiente: null }),
  } as unknown as CitaRepository;
  const svc = new AgendaService({ agenda, citas: repo });

  it('agenda del dia: solo medicos activos, con sus citas del dia y los nombres de paciente', async () => {
    const r = await svc.agendaDelDia('2026-11-10');
    expect(r.medicos.map((m) => m.medicoId)).toEqual(['m1', 'm2']);
    const m1 = r.medicos[0];
    expect(m1.celdas.map((c) => [c.hora, c.estado])).toEqual([['10:00', 'CONFIRMADA'], ['11:00', 'EN_SALA']]);
    expect(m1.celdas[0].paciente?.nombre).toBe('Carla Rojas Vaca');
    expect(m1.resumen).toMatchObject({ citas: 2, enSala: 1 });
    // el 11 solo hay una cita de m1 y ninguna de m2
    expect((await svc.agendaDelDia('2026-11-11')).medicos.map((m) => m.celdas.length)).toEqual([1, 0]);
  });

  it('filtra por especialidad y consultorio', async () => {
    expect((await svc.agendaDelDia('2026-11-10', { especialidad: 'neumologia' })).medicos.map((m) => m.medicoId)).toEqual(['m2']);
    expect((await svc.agendaDelDia('2026-11-10', { consultorio: 'Cons. 3' })).medicos.map((m) => m.medicoId)).toEqual(['m1']);
  });

  it('mi agenda: por claim medico_id o por usuario; sin vinculo es 404', async () => {
    expect((await svc.miAgenda({ medicoId: 'm1' }, '2026-11-10')).celdas).toHaveLength(2);
    expect((await svc.miAgenda({ username: 'medico' }, '2026-11-10')).medicoId).toBe('m1');
    await expect(svc.miAgenda({ username: 'otro' }, '2026-11-10')).rejects.toMatchObject({ code: 'MEDICO_NO_VINCULADO' });
  });

  it('resumen por especialidad, medico y estado cuenta confirmadas y canceladas', async () => {
    const r = await svc.resumen('2026-11-01T00:00:00Z', '2026-11-30T23:59:59Z', 'especialidad');
    expect(r.total).toBe(5);
    expect(r.grupos).toEqual([{ clave: 'cardiologia', total: 5, confirmadas: 3, canceladas: 1, atendidas: 0, noAsistio: 0 }]);
    const porMedico = await svc.resumen('2026-11-01T00:00:00Z', '2026-11-30T23:59:59Z', 'medico');
    expect(porMedico.grupos.map((g) => [g.clave, g.total])).toEqual([['Dra. Valeria Antelo', 4], ['Dr. Marcelo Suarez', 1]]);
    expect((await svc.resumen('2026-11-01T00:00:00Z', '2026-11-30T23:59:59Z', 'estado')).grupos.map((g) => g.clave).sort()).toEqual(['CANCELADA_USUARIO', 'CONFIRMADA', 'EN_SALA', 'RESERVADA']);
    expect((await svc.resumen('2027-01-01T00:00:00Z', '2027-01-31T00:00:00Z', 'mes')).total).toBe(0);
  });

  it('historial: 404 si no existe y pasos de la SAGA si existe', async () => {
    const conCita = new AgendaService({ agenda, citas: { cargar: async (id: string) => (id === 'ok' ? citas[0] : null) } as unknown as CitaRepository });
    await expect(conCita.historial('no')).rejects.toMatchObject({ code: 'CITA_NO_ENCONTRADA' });
    const h = await conCita.historial('ok');
    expect(h.pasos).toHaveLength(3);
    expect(h.transiciones.length).toBeGreaterThan(2);
  });
});
