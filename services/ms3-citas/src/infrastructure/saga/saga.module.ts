import { randomUUID } from 'node:crypto';
import { Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import { createDocClient, DynamoMessageDeduplicator } from '@sigec/idempotency-nest';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer } from '@sigec/messaging-nest';
import { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import { policyFromEnv } from '../../application/saga/saga-policy.js';
import type { SagaEvent } from '../../application/saga/saga-machine.js';
import { CitasController } from '../http/citas.controller.js';
import { DynamoCitaRepository } from '../persistence/dynamo-cita.repository.js';

const QUEUE = 'ms3.saga.respuestas';

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

/**
 * Consumidor de ms3.saga.respuestas + barrido de plazos. Solo arrancan fuera de pruebas (NODE_ENV=test)
 * y si SAGA_WORKERS no es "off".
 */
@Injectable()
class SagaWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Saga');
  private consumer?: RabbitConsumer;
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly service: CitaSagaService,
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
  }
}

@Module({
  imports: [MessagingModule.forRoot()],
  controllers: [CitasController],
  providers: [
    {
      provide: CitaSagaService,
      useFactory: () => {
        const repo = new DynamoCitaRepository(createDocClient(), {
          citas: process.env.CITAS_TABLE ?? 'citas',
          outbox: process.env.OUTBOX_TABLE ?? 'outbox',
        });
        const log = new Logger('Saga');
        return new CitaSagaService({ repo, policy: policyFromEnv(), newId: randomUUID, log: (m) => log.warn(m) });
      },
    },
    SagaWorkers,
  ],
})
export class CitasModule {}
