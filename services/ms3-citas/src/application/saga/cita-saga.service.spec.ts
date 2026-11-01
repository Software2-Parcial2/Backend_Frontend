import { randomUUID } from 'node:crypto';
import {
  ConcurrentUpdateError,
  HorarioNoDisponibleError,
  HorarioPerdidoError,
  SolicitudInvalidaError,
  type CitaAggregate,
} from '../../domain/cita.js';
import type { CitaChange, CitaRepository } from './cita-repository.js';
import { CitaSagaService } from './cita-saga.service.js';
import { DEFAULT_POLICY } from './saga-policy.js';

/** Repositorio en memoria con las mismas garantias que el de DynamoDB (version, horario condicional). */
class MemoryRepo implements CitaRepository {
  citas = new Map<string, CitaAggregate>();
  horarios = new Map<string, { citaId: string; estado: string; expira?: number }>();
  outbox: { type: string; correlationId: string; causationId: string | null }[] = [];
  perderConfirmacion = false;
  conflictosPendientes = 0;
  constructor(private now: () => number) {}

  async cargar(id: string) {
    const c = this.citas.get(id);
    return c ? structuredClone(c) : null;
  }
  async aplicar(change: CitaChange) {
    const cur = this.citas.get(change.aggregate.citaId);
    if (this.conflictosPendientes > 0) {
      this.conflictosPendientes--;
      throw new ConcurrentUpdateError(change.aggregate.citaId);
    }
    if ((cur?.version ?? null) !== change.expectedVersion) throw new ConcurrentUpdateError(change.aggregate.citaId);
    for (const op of change.horarioOps) {
      const key = `${op.medicoId}|${op.fechaHora}`;
      const h = this.horarios.get(key);
      if (op.op === 'RESERVAR') {
        const libre = !h || h.estado === 'LIBRE' || (h.estado === 'RESERVADO' && (h.expira ?? 0) < this.now());
        if (!libre) throw new HorarioNoDisponibleError(op.medicoId, op.fechaHora);
        this.horarios.set(key, { citaId: op.citaId, estado: 'RESERVADO', expira: op.expiraEn });
      } else if (op.op === 'CONFIRMAR') {
        if (this.perderConfirmacion || h?.citaId !== op.citaId) throw new HorarioPerdidoError(op.citaId);
        this.horarios.set(key, { citaId: op.citaId, estado: 'CONFIRMADO' });
      } else if (h?.citaId === op.citaId) {
        this.horarios.set(key, { citaId: '', estado: 'LIBRE' });
      }
    }
    this.citas.set(change.aggregate.citaId, structuredClone({ ...change.aggregate, version: (change.expectedVersion ?? -1) + 1 }));
    this.outbox.push(...change.messages.map((m) => ({ type: m.type, correlationId: m.correlationId, causationId: m.causationId })));
  }
  async sagasVencidas(now: number) {
    return [...this.citas.values()].filter((c) => c.saga.estado === 'EN_CURSO' && (c.saga.deadline ?? Infinity) <= now).map((c) => c.citaId);
  }
  async notificacionesPendientes(now: number) {
    return [...this.citas.values()].filter((c) => c.notificacion.estado === 'PENDIENTE' && (c.notificacion.proximoIntento ?? Infinity) <= now).map((c) => c.citaId);
  }
  async listar() {
    return [...this.citas.values()];
  }
}

const MEDICO = randomUUID();
let now = Date.UTC(2026, 11, 1, 8, 0, 0);
const futuro = (h: number) => new Date(now + h * 3600_000).toISOString();
const input = (fechaHora = futuro(2)) => ({ pacienteId: randomUUID(), medicoId: MEDICO, especialidad: 'general', fechaHora });

function setup(policy = {}) {
  now = Date.UTC(2026, 11, 1, 8, 0, 0);
  const repo = new MemoryRepo(() => now);
  const service = new CitaSagaService({
    repo,
    policy: { ...DEFAULT_POLICY, jitterRatio: 0, ...policy },
    now: () => now,
    random: () => 0,
    newId: () => randomUUID(),
  });
  return { repo, service };
}

describe('CitaSagaService', () => {
  it('solicitar reserva el horario, crea la cita y encola el comando de cobro con el sagaId como correlationId', async () => {
    const { repo, service } = setup();
    const { citaId, sagaId } = await service.solicitar(input());
    const cita = (await service.obtener(citaId))!;
    expect(cita.estado).toBe('RESERVADA');
    expect(cita.saga.sagaId).toBe(sagaId);
    expect(repo.outbox).toEqual([{ type: 'facturacion.cobro-provisional.solicitar', correlationId: sagaId, causationId: null }]);
  });

  it('no permite reservar dos veces el mismo horario', async () => {
    const { service } = setup();
    const fecha = futuro(3);
    await service.solicitar(input(fecha));
    await expect(service.solicitar(input(fecha))).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    await expect(service.solicitar(input(futuro(4)))).resolves.toBeDefined(); // otro horario si
  });

  it('una reserva vencida equivale a un horario libre', async () => {
    const { service } = setup({ reservaTtlMs: 10 * 60_000 });
    const fecha = futuro(3);
    await service.solicitar(input(fecha));
    now += 10 * 60_000 + 1;
    await expect(service.solicitar(input(fecha))).resolves.toBeDefined();
  });

  it('rechaza fechas invalidas o pasadas', async () => {
    const { service } = setup();
    await expect(service.solicitar(input('no es fecha'))).rejects.toBeInstanceOf(SolicitudInvalidaError);
    await expect(service.solicitar(input(futuro(-1)))).rejects.toBeInstanceOf(SolicitudInvalidaError);
  });

  it('flujo feliz con respuestas: cobro registrado y notificacion enviada -> CONFIRMADA', async () => {
    const { repo, service } = setup();
    const { citaId } = await service.solicitar(input());
    await service.onEvent(citaId, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 100 }, 'msg-1');
    expect((await service.obtener(citaId))!.estado).toBe('COBRO_PROVISIONAL');
    await service.onEvent(citaId, { type: 'NOTIFICACION_ENVIADA' }, 'msg-2');
    const fin = (await service.obtener(citaId))!;
    expect(fin.estado).toBe('CONFIRMADA');
    expect(fin.saga.estado).toBe('COMPLETADA');
    // el comando de notificacion lleva como causationId el id del mensaje que lo causo
    expect(repo.outbox.map((m) => [m.type, m.causationId])).toContainEqual(['notificaciones.cita-confirmada.enviar', 'msg-1']);
  });

  it('cobro rechazado: libera el horario (se puede volver a reservar) y deja la cita CANCELADA', async () => {
    const { service } = setup();
    const fecha = futuro(5);
    const { citaId } = await service.solicitar(input(fecha));
    await service.onEvent(citaId, { type: 'COBRO_RECHAZADO', motivo: 'bloqueado' });
    expect((await service.obtener(citaId))!.estado).toBe('CANCELADA');
    await expect(service.solicitar(input(fecha))).resolves.toBeDefined();
  });

  it('procesarVencimientos reintenta y luego compensa', async () => {
    const { repo, service } = setup({ stepTimeoutMs: 1000, maxAttempts: 2, backoffBaseMs: 500 });
    const { citaId } = await service.solicitar(input());
    now += 1000;
    expect(await service.procesarVencimientos()).toBe(1);
    expect((await service.obtener(citaId))!.saga.intentos).toBe(2);
    now += 1000 + 500 + 1;
    expect(await service.procesarVencimientos()).toBe(1);
    const c = (await service.obtener(citaId))!;
    expect(c.estado).toBe('CANCELADA');
    expect(repo.outbox.filter((m) => m.type === 'facturacion.cobro-provisional.solicitar')).toHaveLength(2);
    expect(repo.outbox.map((m) => m.type)).toContain('facturacion.cobro.anular');
    expect(await service.procesarVencimientos()).toBe(0);
  });

  it('si al registrar el cobro la reserva ya no es nuestra, anula el cobro y deja la cita ANULADA', async () => {
    const { repo, service } = setup();
    const { citaId } = await service.solicitar(input());
    repo.perderConfirmacion = true;
    const facturaId = randomUUID();
    await service.onEvent(citaId, { type: 'COBRO_REGISTRADO', facturaId, monto: 10 });
    const c = (await service.obtener(citaId))!;
    expect(c.estado).toBe('ANULADA');
    expect(c.facturaId).toBe(facturaId);
    expect(c.saga.compensaciones).toEqual(['ANULAR_COBRO', 'LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION']);
    expect(repo.outbox.map((m) => m.type)).toContain('facturacion.cobro.anular');
  });

  it('ante un conflicto de version relee y reaplica', async () => {
    const { repo, service } = setup();
    const { citaId } = await service.solicitar(input());
    repo.conflictosPendientes = 2;
    await expect(service.onEvent(citaId, { type: 'COBRO_RECHAZADO', motivo: 'x' })).resolves.toBe(true);
    expect((await service.obtener(citaId))!.estado).toBe('CANCELADA');
  });

  it('un evento duplicado o de una cita desconocida se ignora', async () => {
    const { service } = setup();
    const { citaId } = await service.solicitar(input());
    await service.onEvent(citaId, { type: 'COBRO_RECHAZADO', motivo: 'x' });
    expect(await service.onEvent(citaId, { type: 'COBRO_RECHAZADO', motivo: 'x' })).toBe(false);
    expect(await service.onEvent(randomUUID(), { type: 'COBRO_RECHAZADO', motivo: 'x' })).toBe(false);
  });
});
