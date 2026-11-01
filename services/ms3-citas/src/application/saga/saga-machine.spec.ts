import { aplicar, CMD, iniciar, type MachineDeps, type SagaEvent, type Transition } from './saga-machine.js';
import { DEFAULT_POLICY, type SagaPolicy } from './saga-policy.js';
import type { CitaAggregate, CitaInput } from '../../domain/cita.js';

const INPUT: CitaInput = {
  pacienteId: '11111111-1111-4111-8111-111111111111',
  medicoId: '22222222-2222-4222-8222-222222222222',
  especialidad: 'general',
  fechaHora: '2026-12-01T10:00:00.000Z',
};
const T0 = 1_000_000;
const policy = (over: Partial<SagaPolicy> = {}): SagaPolicy => ({
  ...DEFAULT_POLICY,
  stepTimeoutMs: 30_000,
  maxAttempts: 3,
  backoffBaseMs: 2_000,
  jitterRatio: 0, // determinista
  ...over,
});
let seq = 0;
const deps = (now = T0, over: Partial<SagaPolicy> = {}): MachineDeps => ({ now, policy: policy(over), random: () => 0, newId: () => `id-${++seq}` });

const start = (over: Partial<SagaPolicy> = {}) => iniciar(INPUT, deps(T0, over));
const step = (agg: CitaAggregate, event: SagaEvent, now = T0, over: Partial<SagaPolicy> = {}): Transition => {
  const t = aplicar(agg, event, deps(now, over));
  if (!t) throw new Error(`evento ${event.type} ignorado`);
  return t;
};
const cmds = (t: Transition) => t.commands.map((c) => c.type);

describe('SAGA de citas - maquina de estados', () => {
  describe('iniciar', () => {
    it('reserva el horario y solicita el cobro provisional', () => {
      const t = start();
      expect(t.aggregate.estado).toBe('RESERVADA');
      expect(t.aggregate.saga).toMatchObject({ estado: 'EN_CURSO', paso: 'COBRO_PROVISIONAL', intentos: 1, deadline: T0 + 30_000, cobroSolicitado: true });
      expect(t.horarioOps).toEqual([
        { op: 'RESERVAR', medicoId: INPUT.medicoId, fechaHora: INPUT.fechaHora, citaId: t.aggregate.citaId, expiraEn: T0 + DEFAULT_POLICY.reservaTtlMs },
      ]);
      expect(cmds(t)).toEqual([CMD.cobroSolicitar]);
      expect(t.commands[0].payload).toMatchObject({ citaId: t.aggregate.citaId, especialidad: 'general' });
      expect(t.aggregate.saga.historial.map((h) => h.evento)).toEqual(['CITA_CREADA', 'HORARIO_RESERVADO', 'COBRO_SOLICITADO']);
    });
  });

  describe('flujo feliz', () => {
    it('cobro registrado -> notificacion enviada -> CONFIRMADA', () => {
      const a = start().aggregate;
      const cobro = step(a, { type: 'COBRO_REGISTRADO', facturaId: 'f-1', monto: 100 });
      expect(cobro.aggregate.estado).toBe('COBRO_PROVISIONAL');
      expect(cobro.aggregate.facturaId).toBe('f-1');
      expect(cobro.aggregate.saga).toMatchObject({ paso: 'NOTIFICACION', intentos: 1 });
      expect(cobro.horarioOps).toEqual([{ op: 'CONFIRMAR', medicoId: INPUT.medicoId, fechaHora: INPUT.fechaHora, citaId: a.citaId }]);
      expect(cmds(cobro)).toEqual([CMD.notifConfirmada]);

      const fin = step(cobro.aggregate, { type: 'NOTIFICACION_ENVIADA' });
      expect(fin.aggregate.estado).toBe('CONFIRMADA');
      expect(fin.aggregate.saga).toMatchObject({ estado: 'COMPLETADA', paso: 'FIN', deadline: null });
      expect(fin.aggregate.notificacion.estado).toBe('ENVIADA');
      expect(fin.commands).toEqual([]); // por defecto el cobro queda PROVISIONAL
    });

    it('con la politica confirmarCobro envia facturacion.cobro.confirmar al final', () => {
      const a = start({ confirmarCobro: true }).aggregate;
      const cobro = step(a, { type: 'COBRO_REGISTRADO', facturaId: 'f-1', monto: 100 }, T0, { confirmarCobro: true });
      const fin = step(cobro.aggregate, { type: 'NOTIFICACION_ENVIADA' }, T0, { confirmarCobro: true });
      expect(cmds(fin)).toEqual([CMD.cobroConfirmar]);
      expect(fin.commands[0].payload).toEqual({ citaId: a.citaId, facturaId: 'f-1' });
    });
  });

  describe('rechazo del cobro', () => {
    it('libera el horario, cancela la cita y no anula un cobro que no existe', () => {
      const a = start().aggregate;
      const t = step(a, { type: 'COBRO_RECHAZADO', motivo: 'paciente bloqueado' });
      expect(t.aggregate.estado).toBe('CANCELADA');
      expect(t.aggregate.motivoFallo).toMatch(/paciente bloqueado/);
      expect(t.aggregate.saga).toMatchObject({ estado: 'COMPENSADA', paso: 'FIN', deadline: null });
      expect(t.horarioOps).toEqual([{ op: 'LIBERAR', medicoId: INPUT.medicoId, fechaHora: INPUT.fechaHora, citaId: a.citaId }]);
      expect(cmds(t)).toEqual([CMD.notifCancelada]);
      expect(t.aggregate.saga.compensaciones).toEqual(['LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION']);
    });
  });

  describe('timeouts y reintentos', () => {
    it('un timeout que aun no vencio se ignora', () => {
      const a = start().aggregate;
      expect(aplicar(a, { type: 'TIMEOUT' }, deps(T0 + 29_999))).toBeNull();
    });

    it('reintenta el cobro con backoff exponencial y reenvia el comando', () => {
      const a = start().aggregate;
      const t1 = step(a, { type: 'TIMEOUT' }, T0 + 30_000);
      expect(t1.aggregate.saga.intentos).toBe(2);
      expect(cmds(t1)).toEqual([CMD.cobroSolicitar]);
      expect(t1.aggregate.saga.deadline).toBe(T0 + 30_000 + 30_000 + 2_000); // timeout + backoff 2 s
      expect(t1.horarioOps).toEqual([]);

      const t2 = step(t1.aggregate, { type: 'TIMEOUT' }, t1.aggregate.saga.deadline!);
      expect(t2.aggregate.saga.intentos).toBe(3);
      expect(t2.aggregate.saga.deadline).toBe(t1.aggregate.saga.deadline! + 30_000 + 4_000); // backoff 4 s
      expect(t2.aggregate.estado).toBe('RESERVADA'); // aun no se compensa
    });

    it('el jitter solo suma tiempo, nunca resta', () => {
      const a = start().aggregate;
      const d = { ...deps(T0 + 30_000), policy: policy({ jitterRatio: 0.5 }), random: () => 1 };
      const t = aplicar(a, { type: 'TIMEOUT' }, d)!;
      expect(t.aggregate.saga.deadline).toBe(T0 + 30_000 + 30_000 + 3_000); // 2000 * (1 + 0.5)
    });

    it('agotados los intentos compensa en orden inverso: anular cobro, liberar horario, avisar', () => {
      let agg = start().aggregate;
      let now = T0;
      for (let i = 0; i < 2; i++) {
        now = agg.saga.deadline!;
        agg = step(agg, { type: 'TIMEOUT' }, now).aggregate;
      }
      now = agg.saga.deadline!;
      const t = step(agg, { type: 'TIMEOUT' }, now);
      expect(t.aggregate.estado).toBe('CANCELADA');
      expect(t.aggregate.saga.estado).toBe('COMPENSADA');
      expect(t.aggregate.saga.anulacionCobro).toBe('PENDIENTE');
      expect(t.aggregate.saga.compensaciones).toEqual(['ANULAR_COBRO', 'LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION']);
      expect(cmds(t)).toEqual([CMD.cobroAnular, CMD.notifCancelada]); // el cobro puede existir aunque no hayamos recibido respuesta
      expect(t.horarioOps.map((o) => o.op)).toEqual(['LIBERAR']);
      expect(t.aggregate.motivoFallo).toMatch(/timeout del cobro tras 3 intentos/);
    });
  });

  describe('notificacion', () => {
    const conCobro = () => step(start().aggregate, { type: 'COBRO_REGISTRADO', facturaId: 'f-1', monto: 50 }).aggregate;

    it('una notificacion fallida NO anula la cita: queda CONFIRMADA con notificacion PENDIENTE', () => {
      const t = step(conCobro(), { type: 'NOTIFICACION_FALLIDA', motivo: 'canal caido' });
      expect(t.aggregate.estado).toBe('CONFIRMADA');
      expect(t.aggregate.saga.estado).toBe('COMPLETADA');
      expect(t.aggregate.notificacion).toMatchObject({ estado: 'PENDIENTE', intentos: 0 });
      expect(t.aggregate.notificacion.proximoIntento).toBe(T0 + DEFAULT_POLICY.notificacionReintentoMs);
      expect(t.horarioOps).toEqual([]);
      expect(cmds(t)).not.toContain(CMD.cobroAnular);
    });

    it('si la notificacion no responde se reintenta y al agotarse la cita sigue confirmada', () => {
      let agg = conCobro();
      for (let i = 0; i < 2; i++) agg = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!).aggregate;
      expect(agg.saga.intentos).toBe(3);
      const t = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!);
      expect(t.aggregate.estado).toBe('CONFIRMADA');
      expect(t.aggregate.notificacion.estado).toBe('PENDIENTE');
      expect(cmds(t)).toEqual([]);
    });

    it('reintento aparte: envia de nuevo, cuenta intentos y se detiene en el maximo', () => {
      let agg = step(conCobro(), { type: 'NOTIFICACION_FALLIDA', motivo: 'x' }).aggregate;
      const t1 = step(agg, { type: 'REINTENTAR_NOTIFICACION' }, T0 + 40_000, { notificacionMaxReintentos: 2 });
      expect(cmds(t1)).toEqual([CMD.notifConfirmada]);
      expect(t1.aggregate.notificacion.intentos).toBe(1);
      const t2 = step(t1.aggregate, { type: 'REINTENTAR_NOTIFICACION' }, T0 + 80_000, { notificacionMaxReintentos: 2 });
      expect(t2.aggregate.notificacion.intentos).toBe(2);
      const t3 = step(t2.aggregate, { type: 'REINTENTAR_NOTIFICACION' }, T0 + 120_000, { notificacionMaxReintentos: 2 });
      expect(cmds(t3)).toEqual([]); // abandonada
      expect(t3.aggregate.saga.historial.at(-1)?.evento).toBe('NOTIFICACION_ABANDONADA');
    });

    it('una confirmacion tardia de la notificacion la marca como ENVIADA', () => {
      const pendiente = step(conCobro(), { type: 'NOTIFICACION_FALLIDA', motivo: 'x' }).aggregate;
      const t = step(pendiente, { type: 'NOTIFICACION_ENVIADA' });
      expect(t.aggregate.notificacion.estado).toBe('ENVIADA');
      expect(t.aggregate.estado).toBe('CONFIRMADA');
    });
  });

  describe('reserva perdida', () => {
    it('si al confirmar el horario ya es de otra cita se anula el cobro y la cita queda ANULADA', () => {
      const registrado = step(start().aggregate, { type: 'COBRO_REGISTRADO', facturaId: 'f-9', monto: 10 });
      // la persistencia detecta la condicion fallida del horario y reinyecta el evento sobre el estado previo
      const t = step(start().aggregate, { type: 'HORARIO_PERDIDO' });
      expect(t.aggregate.estado).toBe('CANCELADA');
      const t2 = step({ ...registrado.aggregate }, { type: 'HORARIO_PERDIDO' });
      expect(t2.aggregate.estado).toBe('ANULADA');
      expect(t2.aggregate.saga.compensaciones).toEqual(['ANULAR_COBRO', 'LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION']);
      expect(t2.commands.find((c) => c.type === CMD.cobroAnular)?.payload).toMatchObject({ facturaId: 'f-9' });
    });
  });

  describe('eventos fuera de lugar', () => {
    it('se ignoran respuestas en estados que no las esperan', () => {
      const a = start().aggregate;
      expect(aplicar(a, { type: 'NOTIFICACION_ENVIADA' }, deps())).toBeNull(); // aun estamos en el cobro
      expect(aplicar(a, { type: 'COBRO_ANULADO' }, deps())).toBeNull();
      const rechazada = step(a, { type: 'COBRO_RECHAZADO', motivo: 'x' }).aggregate;
      expect(aplicar(rechazada, { type: 'COBRO_RECHAZADO', motivo: 'otra vez' }, deps())).toBeNull(); // duplicado
      expect(aplicar(rechazada, { type: 'TIMEOUT' }, deps(T0 + 999_999))).toBeNull();
    });

    it('un cobro registrado tardiamente tras compensar se anula', () => {
      let agg = start().aggregate;
      for (let i = 0; i < 2; i++) agg = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!).aggregate;
      const compensada = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!).aggregate;
      const t = step(compensada, { type: 'COBRO_REGISTRADO', facturaId: 'f-tarde', monto: 100 });
      expect(t.aggregate.estado).toBe('ANULADA');
      expect(t.commands).toEqual([{ type: CMD.cobroAnular, payload: expect.objectContaining({ facturaId: 'f-tarde', citaId: agg.citaId }) }]);
      expect(t.horarioOps).toEqual([]); // el horario ya se libero
    });

    it('COBRO_ANULADO confirma la anulacion pendiente', () => {
      let agg = start().aggregate;
      for (let i = 0; i < 2; i++) agg = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!).aggregate;
      const compensada = step(agg, { type: 'TIMEOUT' }, agg.saga.deadline!).aggregate;
      const t = step(compensada, { type: 'COBRO_ANULADO', facturaId: 'f-1' });
      expect(t.aggregate.saga.anulacionCobro).toBe('CONFIRMADA');
    });
  });

  it('las transiciones son inmutables: el agregado de entrada no se modifica', () => {
    const a = start().aggregate;
    const copia = JSON.parse(JSON.stringify(a));
    step(a, { type: 'COBRO_RECHAZADO', motivo: 'x' });
    step(a, { type: 'COBRO_REGISTRADO', facturaId: 'f', monto: 1 });
    expect(a).toEqual(copia);
  });
});
