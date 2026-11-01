import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { createDocClient, DynamoMessageDeduplicator } from '@sigec/idempotency-nest';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer } from '@sigec/messaging-nest';
import { EnviarNotificacionUseCase, type NotificacionRepository } from '../application/enviar-notificacion.use-case.js';
import type { NotificacionTipo } from '../domain/notificacion.js';
import { NotificacionesController } from './http/notificaciones.controller.js';
import { NOTIFICACION_REPOSITORY } from './notificaciones.tokens.js';
import { SimulatedSender } from './messaging/simulated-sender.js';
import { DynamoNotificacionRepository } from './persistence/dynamo-notificacion.repository.js';

const QUEUE = 'ms8.saga.comandos';

const TIPOS: Record<string, NotificacionTipo> = {
  'notificaciones.cita-confirmada.enviar': 'CITA_CONFIRMADA',
  'notificaciones.cita-cancelada.enviar': 'CITA_CANCELADA',
};

/** Consumidor de ms8.saga.comandos. Solo arranca fuera de pruebas (NODE_ENV=test) y si SAGA_WORKERS no es "off". */
@Injectable()
class NotificacionesWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Notificaciones');
  private consumer?: RabbitConsumer;

  constructor(
    private readonly useCase: EnviarNotificacionUseCase,
    @Inject(RabbitConnection) private readonly connection: RabbitConnection,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.SAGA_WORKERS === 'off') return;
    this.consumer = new RabbitConsumer(this.connection, {
      spec: queueSpec(QUEUE),
      onLog: (m) => this.log.log(m),
      deduplicator: new DynamoMessageDeduplicator(createDocClient(), process.env.PROCESSED_TABLE ?? 'ms8_processed_messages'),
      handler: async (env) => {
        const tipo = TIPOS[env.type];
        if (!tipo) {
          this.log.warn(`comando ${env.type} desconocido; se ignora`);
          return;
        }
        const n = await this.useCase.ejecutar({
          mensajeId: env.id,
          correlationId: env.correlationId,
          citaId: String(env.payload.citaId),
          pacienteId: String(env.payload.pacienteId),
          tipo,
        });
        this.log.log(`${env.type} cita=${n.citaId.slice(0, 8)} -> ${n.estado}`);
      },
    });
    this.consumer.start().catch((e: Error) => this.log.warn(`consumidor: ${e.message}`));
  }

  async onApplicationShutdown() {
    await this.consumer?.stop();
  }
}

@Module({
  imports: [MessagingModule.forRoot()],
  controllers: [NotificacionesController],
  providers: [
    {
      provide: NOTIFICACION_REPOSITORY,
      useFactory: (): NotificacionRepository =>
        new DynamoNotificacionRepository(createDocClient(), {
          notificaciones: process.env.NOTIFICACIONES_TABLE ?? 'notificaciones',
          outbox: process.env.OUTBOX_TABLE ?? 'ms8_outbox',
        }),
    },
    {
      provide: EnviarNotificacionUseCase,
      useFactory: (repo: NotificacionRepository) => {
        const log = new Logger('Notificaciones');
        return new EnviarNotificacionUseCase(new SimulatedSender(process.env, (m) => log.log(m)), repo, randomUUID);
      },
      inject: [NOTIFICACION_REPOSITORY],
    },
    NotificacionesWorkers,
  ],
})
export class NotificacionesModule {}
