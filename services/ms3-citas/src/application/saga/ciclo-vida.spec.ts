import { describe, expect, it } from 'vitest';
import { TransicionInvalidaError, type CitaAggregate } from '../../domain/cita.js';
import { cancelar, registrarAsistencia, reprogramar } from './ciclo-vida.js';
import { aplicar, iniciar, type MachineDeps } from './saga-machine.js';
import { DEFAULT_POLICY } from './saga-policy.js';

const T0 = Date.parse('2026-11-03T08:00:00Z');
let n = 0;
const deps = (now = T0): MachineDeps => ({ now, policy: DEFAULT_POLICY, random: () => 0, newId: () => `id-${++n}` });
const FUTURA = '2026-11-10T14:00:00.000Z';

/** Cita CONFIRMADA con cobro, llevada por la propia maquina de la SAGA. */
function confirmada(): CitaAggregate {
  let agg = iniciar({ pacienteId: 'p1', medicoId: 'm1', especialidad: 'cardiologia', fechaHora: FUTURA }, deps()).aggregate;
  agg = aplicar(agg, { type: 'COBRO_REGISTRADO', facturaId: 'f1', monto: 180 }, deps())!.aggregate;
  agg = aplicar(agg, { type: 'NOTIFICACION_ENVIADA' }, deps())!.aggregate;
  expect(agg.estado).toBe('CONFIRMADA');
  return agg;
}

describe('cancelar', () => {
  it('anula el cobro, libera el horario, avisa y publica cita.cancelada', () => {
    const t = cancelar(confirmada(), 'Pedido del paciente', 'recepcion', deps());
    expect(t.aggregate.estado).toBe('CANCELADA_USUARIO');
    expect(t.aggregate.cancelacion).toMatchObject({ motivo: 'Pedido del paciente', por: 'recepcion' });
    expect(t.aggregate.saga.anulacionCobro).toBe('PENDIENTE');
    expect(t.aggregate.notificacion.estado).toBe('NO_APLICA');
    expect(t.horarioOps).toEqual([{ op: 'LIBERAR', medicoId: 'm1', fechaHora: FUTURA, citaId: t.aggregate.citaId }]);
    expect(t.commands.map((c) => c.type)).toEqual(['facturacion.cobro.anular', 'notificaciones.cita-cancelada.enviar', 'cita.cancelada']);
    expect(t.commands[0].payload).toMatchObject({ facturaId: 'f1', motivo: 'Pedido del paciente' });
    expect(t.commands[2].exchange).toBe('sigec.eventos');
  });

  it('la confirmacion de la anulacion cierra la compensacion (reusa COBRO_ANULADO de la SAGA)', () => {
    const t = cancelar(confirmada(), 'x', 'u', deps());
    const fin = aplicar(t.aggregate, { type: 'COBRO_ANULADO', facturaId: 'f1' }, deps())!;
    expect(fin.aggregate.saga.anulacionCobro).toBe('CONFIRMADA');
  });

  it('no cancela una cita ya cancelada, atendida, pasada o con la SAGA en curso', () => {
    const c = cancelar(confirmada(), 'x', 'u', deps()).aggregate;
    expect(() => cancelar(c, 'y', 'u', deps())).toThrowError(expect.objectContaining({ code: 'CITA_YA_CANCELADA' }));
    expect(() => cancelar({ ...confirmada(), estado: 'ATENDIDA' }, 'y', 'u', deps())).toThrowError(expect.objectContaining({ code: 'CITA_NO_MODIFICABLE' }));
    expect(() => cancelar(confirmada(), 'y', 'u', deps(Date.parse('2026-11-11T00:00:00Z')))).toThrowError(expect.objectContaining({ code: 'CITA_PASADA' }));
    const enCurso = iniciar({ pacienteId: 'p', medicoId: 'm', especialidad: 'e', fechaHora: FUTURA }, deps()).aggregate;
    expect(() => cancelar(enCurso, 'y', 'u', deps())).toThrowError(expect.objectContaining({ code: 'CITA_EN_PROCESO' }));
  });
});

describe('reprogramar', () => {
  it('toma el horario nuevo ya confirmado y libera el viejo en la misma transaccion; conserva el cargo', () => {
    const base = confirmada();
    const t = reprogramar(base, '2026-11-12T15:30:00Z', 'paciente', deps());
    expect(t.aggregate.input.fechaHora).toBe('2026-11-12T15:30:00.000Z');
    expect(t.aggregate.facturaId).toBe('f1');
    expect(t.aggregate.estado).toBe('CONFIRMADA');
    expect(t.aggregate.reprogramaciones).toEqual([{ desde: FUTURA, hacia: '2026-11-12T15:30:00.000Z', por: 'paciente', at: T0 }]);
    expect(t.horarioOps.map((o) => o.op)).toEqual(['TOMAR', 'LIBERAR']); // el nuevo primero: si falla, nada cambia
    expect(t.horarioOps[0]).toMatchObject({ fechaHora: '2026-11-12T15:30:00.000Z' });
    expect(t.horarioOps[1]).toMatchObject({ fechaHora: FUTURA });
    expect(t.commands).toHaveLength(1);
    expect(t.commands[0]).toMatchObject({ type: 'cita.reprogramada', exchange: 'sigec.eventos' });
    expect(t.commands[0].payload).toMatchObject({ fechaHoraAnterior: FUTURA });
  });

  it('rechaza fechas invalidas, pasadas o iguales', () => {
    const c = confirmada();
    for (const [f, code] of [['no-fecha', 'FECHA_INVALIDA'], ['2026-11-01T10:00:00Z', 'FECHA_PASADA'], [FUTURA, 'MISMO_HORARIO']] as const) {
      expect(() => reprogramar(c, f, 'u', deps())).toThrowError(expect.objectContaining({ code }));
    }
  });
});

describe('registrarAsistencia', () => {
  it('llegada -> atendida', () => {
    const t1 = registrarAsistencia(confirmada(), 'LLEGO', 'recepcion', deps());
    expect(t1.aggregate.estado).toBe('EN_SALA');
    expect(t1.aggregate.llegadaEn).toBe(T0);
    expect(t1.commands[0].payload).toMatchObject({ asistencia: 'LLEGO' });
    const t2 = registrarAsistencia(t1.aggregate, 'ATENDIDA', 'medico', deps());
    expect(t2.aggregate).toMatchObject({ estado: 'ATENDIDA', asistencia: 'ASISTIO' });
    expect(t2.commands[0].payload).toMatchObject({ asistencia: 'ASISTIO' });
  });

  it('la inasistencia solo se marca cuando llego la hora', () => {
    expect(() => registrarAsistencia(confirmada(), 'NO_ASISTIO', 'recepcion', deps())).toThrowError(expect.objectContaining({ code: 'CITA_FUTURA' }));
    const t = registrarAsistencia(confirmada(), 'NO_ASISTIO', 'recepcion', deps(Date.parse(FUTURA) + 3600_000));
    expect(t.aggregate).toMatchObject({ estado: 'NO_ASISTIO', asistencia: 'NO_ASISTIO' });
    expect(t.commands[0].payload).toMatchObject({ asistencia: 'NO_ASISTIO' });
  });

  it('transiciones invalidas', () => {
    const atendida = registrarAsistencia(confirmada(), 'ATENDIDA', 'm', deps()).aggregate;
    expect(() => registrarAsistencia(atendida, 'LLEGO', 'm', deps())).toThrowError(TransicionInvalidaError);
    expect(() => registrarAsistencia(atendida, 'ATENDIDA', 'm', deps())).toThrowError(TransicionInvalidaError);
    const sala = registrarAsistencia(confirmada(), 'LLEGO', 'm', deps()).aggregate;
    expect(() => registrarAsistencia(sala, 'NO_ASISTIO', 'm', deps(Date.parse(FUTURA) + 1))).toThrowError(TransicionInvalidaError);
  });
});
