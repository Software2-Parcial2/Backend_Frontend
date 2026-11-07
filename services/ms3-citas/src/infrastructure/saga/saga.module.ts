import { randomUUID } from 'node:crypto';
import { Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { createDocClient, DynamoMessageDeduplicator } from '@sigec/idempotency-nest';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer } from '@sigec/messaging-nest';
import { AgendaService } from '../../application/horarios/agenda.service.js';
import { HorariosService } from '../../application/horarios/horarios.service.js';
import { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import type { AgendaRepository } from '../../application/horarios/agenda-repository.js';
import type { CitaRepository } from '../../application/saga/cita-repository.js';
import { policyFromEnv } from '../../application/saga/saga-policy.js';
import type { SagaEvent } from '../../application/saga/saga-machine.js';
import { AgendaController } from '../http/agenda.controller.js';
import { CitasController } from '../http/citas.controller.js';
import { HorariosController } from '../http/horarios.controller.js';
import { DynamoAgendaRepository } from '../persistence/dynamo-agenda.repository.js';
import { DynamoCitaRepository } from '../persistence/dynamo-cita.repository.js';

const QUEUE = 'ms3.saga.respuestas';
const QUEUE_EVENTOS = 'ms3.eventos';
export const CITA_REPO = Symbol('CITA_REPO');
export const AGENDA_REPO = Symbol('AGENDA_REPO');

/** Traduce una respuesta de MS6/MS8 en un evento de la maquina de estados. */
export function toSagaEvent(type: string, payload: Record<string, unknown>): SagaEvent | null {
  switch (type) {
    case 'facturacion.cobro-provisional.registrado':
      return { type: 'COBRO_REGISTRADO', facturaId: String(payload.facturaId), monto: Number(payload.monto) };
    case 'facturacion.cobro-provisional.rechazado':
      return { type: 'COBRO_RECHAZADO', motivo: String(payload.motivo) };
    case 'facturacion.cobro.anulado':
      return { type: 'COBRO_ANULADO', facturaId: payload.facturaId ? String(payload.facturaId) : undefined };
    case 'notificaciones.cita-confirmada.enviada':
      return { type: 'NOTIFICACION_ENVIADA' };
    case 'notificaciones.cita-confirmada.fallida':
      return { type: 'NOTIFICACION_FALLIDA', motivo: String(payload.motivo) };
    default:
      return null;
  }
}

/** Traduce un evento de MS2 en la proyeccion que muestra la agenda (nombres de paciente y datos del medico). */
export async function proyectar(agenda: AgendaRepository, type: string, payload: Record<string, unknown>, occurredAt: string): Promise<boolean> {
  const t = Date.parse(occurredAt) || 0;
  switch (type) {
    case 'paciente.creado':
    case 'paciente.actualizado':
      await agenda.guardarPerfilPaciente({ pacienteId: String(payload.pacienteId), nombre: String(payload.nombre), numeroHistoria: payload.numeroHistoria ? String(payload.numeroHistoria) : '' }, t);
      return true;
    case 'medico.creado':
    case 'medico.actualizado':
      await agenda.guardarPerfilMedico(
        {
          medicoId: String(payload.medicoId),
          nombre: String(payload.nombre),
          especialidad: String(payload.especialidad),
          especialidadNombre: String(payload.especialidadNombre),
          ...(payload.consultorio ? { consultorio: String(payload.consultorio) } : {}),
          activo: payload.activo !== false,
          ...(payload.usuarioKeycloak ? { usuarioKeycloak: String(payload.usuarioKeycloak) } : {}),
        },
        t,
      );
      return true;
    default:
      return false;
  }
}

/**
 * Consumidor de ms3.saga.respuestas + barrido de plazos. Solo arrancan fuera de pruebas (NODE_ENV=test)
 * y si SAGA_WORKERS no es "off".
 */
@Injectable()
class SagaWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Saga');
  private consumer?: RabbitConsumer;
  private eventos?: RabbitConsumer;
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly service: CitaSagaService,
    @Inject(AGENDA_REPO) private readonly agenda: AgendaRepository,
    @Inject(RabbitConnection) private readonly connection: RabbitConnection,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.SAGA_WORKERS === 'off') return;
    this.consumer = new RabbitConsumer(this.connection, {
      spec: queueSpec(QUEUE),
      onLog: (m) => this.log.log(m),
      deduplicator: new DynamoMessageDeduplicator(createDocClient(), process.env.PROCESSED_TABLE ?? 'processed_messages'),
      handler: async (env) => {
        const event = toSagaEvent(env.type, env.payload);
        if (!event) {
          this.log.warn(`mensaje ${env.type} desconocido; se ignora`);
          return;
        }
        const applied = await this.service.onEvent(String(env.payload.citaId), event, env.id);
        this.log.log(`${env.type} cita=${String(env.payload.citaId).slice(0, 8)} -> ${applied ? 'aplicado' : 'ignorado'}`);
      },
    });
    // No bloquea el arranque si RabbitMQ aun no esta: se resuscribe solo.
    this.consumer.start().catch((e: Error) => this.log.warn(`consumidor: ${e.message}`));
    // Proyecciones de la agenda (nombres de pacientes y medicos) desde los eventos de MS2.
    this.eventos = new RabbitConsumer(this.connection, {
      spec: queueSpec(QUEUE_EVENTOS),
      onLog: (m) => this.log.log(m),
      deduplicator: new DynamoMessageDeduplicator(createDocClient(), process.env.PROCESSED_TABLE ?? 'processed_messages'),
      handler: async (env) => {
        const hecho = await proyectar(this.agenda, env.type, env.payload, env.occurredAt);
        this.log.log(`${env.type} -> ${hecho ? 'proyectado' : 'ignorado'}`);
      },
    });
    this.eventos.start().catch((e: Error) => this.log.warn(`consumidor de eventos: ${e.message}`));
    this.timer = setInterval(() => void this.sweep(), Number(process.env.SAGA_SWEEP_MS ?? 1000));
    this.log.log(`SAGA: consumidor de ${QUEUE} y barrido de plazos iniciados`);
  }

  private async sweep() {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.service.procesarVencimientos();
      if (n > 0) this.log.log(`plazos vencidos procesados: ${n}`);
    } catch (e) {
      this.log.warn(`barrido: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.consumer?.stop();
    await this.eventos?.stop();
  }
}

@Module({
  imports: [MessagingModule.forRoot()],
  // Las rutas literales (agenda, medicos/...) van antes que `api/citas/:id`.
  controllers: [AgendaController, HorariosController, CitasController],
  providers: [
    {
      provide: CITA_REPO,
      useFactory: () =>
        new DynamoCitaRepository(createDocClient(), {
          citas: process.env.CITAS_TABLE ?? 'citas',
          outbox: process.env.OUTBOX_TABLE ?? 'outbox',
        }),
    },
    { provide: AGENDA_REPO, useFactory: () => new DynamoAgendaRepository(createDocClient(), process.env.CITAS_TABLE ?? 'citas') },
    {
      provide: CitaSagaService,
      inject: [CITA_REPO],
      useFactory: (repo: CitaRepository) => {
        const log = new Logger('Saga');
        return new CitaSagaService({ repo, policy: policyFromEnv(), newId: randomUUID, log: (m) => log.warn(m) });
      },
    },
    {
      provide: AgendaService,
      inject: [AGENDA_REPO, CITA_REPO],
      useFactory: (agenda: AgendaRepository, citas: CitaRepository) => new AgendaService({ agenda, citas, offsetMin: offsetClinica() }),
    },
    {
      provide: HorariosService,
      inject: [AGENDA_REPO, CITA_REPO],
      useFactory: (agenda: AgendaRepository, citas: CitaRepository) => new HorariosService({ agenda, citas, newId: randomUUID, offsetMin: offsetClinica() }),
    },
    SagaWorkers,
  ],
})
export class CitasModule {}

/** Diferencia horaria de la clinica respecto de UTC, en minutos (CLINICA_UTC_OFFSET_MIN; por defecto -240 = America/La_Paz). */
function offsetClinica(): number {
  const v = Number(process.env.CLINICA_UTC_OFFSET_MIN);
  return Number.isFinite(v) && process.env.CLINICA_UTC_OFFSET_MIN !== undefined && process.env.CLINICA_UTC_OFFSET_MIN !== '' ? v : -240;
}
