import {
  ConcurrentUpdateError,
  HorarioPerdidoError,
  SolicitudInvalidaError,
  type CitaAggregate,
  type CitaInput,
  type OutboxMessage,
  type SagaCommand,
} from '../../domain/cita.js';
import type { CitaRepository, FiltroCitas, PaginaCitas } from './cita-repository.js';
import { aplicar, iniciar, type MachineDeps, type SagaEvent, type Transition } from './saga-machine.js';
import type { SagaPolicy } from './saga-policy.js';

export interface SagaServiceDeps {
  repo: CitaRepository;
  policy: SagaPolicy;
  now?: () => number;
  random?: () => number;
  newId: () => string;
  log?: (msg: string) => void;
}

const EXCHANGE_SAGA = 'sigec.saga';
const MAX_RETRIES = 3;

/** Orquestador de la SAGA de citas: carga el estado, aplica la maquina y persiste atomicamente. Sin framework. */
export class CitaSagaService {
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly d: SagaServiceDeps) {
    this.now = d.now ?? Date.now;
    this.random = d.random ?? Math.random;
  }

  private machineDeps(): MachineDeps {
    return { now: this.now(), policy: this.d.policy, random: this.random, newId: this.d.newId };
  }

  private toMessages(commands: SagaCommand[], agg: CitaAggregate, causationId: string | null): OutboxMessage[] {
    return commands.map((c) => ({
      id: this.d.newId(),
      exchange: c.exchange ?? EXCHANGE_SAGA,
      type: c.type,
      correlationId: agg.saga.sagaId,
      causationId,
      payload: c.payload,
    }));
  }

  /** Paso 1: reserva del horario + arranque de la SAGA, en una transaccion. Lanza HorarioNoDisponibleError si esta ocupado. */
  async solicitar(raw: CitaInput): Promise<{ citaId: string; sagaId: string }> {
    const fecha = new Date(raw.fechaHora);
    if (Number.isNaN(fecha.getTime())) throw new SolicitudInvalidaError('fechaHora no es una fecha valida');
    if (fecha.getTime() <= this.now()) throw new SolicitudInvalidaError('fechaHora debe ser futura');
    const input: CitaInput = { ...raw, fechaHora: fecha.toISOString() };

    const t = iniciar(input, this.machineDeps());
    await this.d.repo.aplicar({
      aggregate: t.aggregate,
      expectedVersion: null,
      horarioOps: t.horarioOps,
      messages: this.toMessages(t.commands, t.aggregate, null),
    });
    return { citaId: t.aggregate.citaId, sagaId: t.aggregate.saga.sagaId };
  }

  /** Aplica un evento (respuesta de un servicio, timeout, ...). Devuelve false si se ignoro. */
  async onEvent(citaId: string, event: SagaEvent, causationId: string | null = null): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      const agg = await this.d.repo.cargar(citaId);
      if (!agg) {
        this.d.log?.(`SAGA: evento ${event.type} para una cita inexistente (${citaId}); se ignora`);
        return false;
      }
      let t: Transition | null = aplicar(agg, event, this.machineDeps());
      if (!t) return false;
      try {
        try {
          await this.persist(agg, t, causationId);
        } catch (e) {
          if (!(e instanceof HorarioPerdidoError)) throw e;
          // Al registrar el cobro descubrimos que la reserva ya no es nuestra: se compensa (el cobro existe -> se anula).
          const base: CitaAggregate = event.type === 'COBRO_REGISTRADO' ? { ...agg, facturaId: event.facturaId } : agg;
          t = aplicar(base, { type: 'HORARIO_PERDIDO' }, this.machineDeps());
          if (!t) return false;
          await this.persist(agg, t, causationId);
        }
        return true;
      } catch (e) {
        if (e instanceof ConcurrentUpdateError && attempt < MAX_RETRIES) continue; // otro proceso avanzo la SAGA: se relee
        throw e;
      }
    }
  }

  private persist(prev: CitaAggregate, t: Transition, causationId: string | null) {
    return this.d.repo.aplicar({
      aggregate: t.aggregate,
      expectedVersion: prev.version,
      horarioOps: t.horarioOps,
      messages: this.toMessages(t.commands, t.aggregate, causationId),
    });
  }

  /** Barrido de plazos vencidos: reintenta el paso o compensa. Devuelve cuantas SAGAs avanzo. */
  async procesarVencimientos(): Promise<number> {
    let n = 0;
    for (const id of await this.d.repo.sagasVencidas(this.now())) {
      if (await this.onEvent(id, { type: 'TIMEOUT' })) n++;
    }
    for (const id of await this.d.repo.notificacionesPendientes(this.now())) {
      if (await this.onEvent(id, { type: 'REINTENTAR_NOTIFICACION' })) n++;
    }
    return n;
  }

  obtener(citaId: string): Promise<CitaAggregate | null> {
    return this.d.repo.cargar(citaId);
  }

  buscar(filtro: FiltroCitas, limite = 20, cursor?: string): Promise<PaginaCitas> {
    return this.d.repo.buscar(filtro, Math.min(Math.max(limite, 1), 100), cursor);
  }
}
