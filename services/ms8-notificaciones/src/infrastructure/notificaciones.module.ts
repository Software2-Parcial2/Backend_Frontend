import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { createDocClient, DynamoMessageDeduplicator } from '@sigec/idempotency-nest';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer } from '@sigec/messaging-nest';
import { NotificacionesService } from '../application/notificaciones.service.js';
import type { AlertaPort, NotificationSender } from '../application/ports.js';
import { InternalController } from './http/internal.controller.js';
import { InternalSecretGuard } from './http/internal-secret.guard.js';
import { NotificacionesController } from './http/notificaciones.controller.js';
import { DlqMonitor } from './messaging/dlq-monitor.js';
import { LogAlerta, N8nAlerta, N8nSender, type N8nOptions } from './messaging/n8n-sender.js';
import { SimulatedSender } from './messaging/simulated-sender.js';
import { DynamoContactoRepository, DynamoNotificacionRepository, DynamoPlantillaRepository, DynamoPreferenciasPersonalRepository, DynamoRecordatorioRepository } from './persistence/dynamo-notificaciones.repositories.js';

const QUEUE_COMANDOS = 'ms8.saga.comandos';
const QUEUE_EVENTOS = 'ms8.eventos';

function n8nOptions(): N8nOptions {
  return {
    baseUrl: process.env.N8N_BASE_URL ?? 'http://localhost:5678',
    secret: process.env.N8N_WEBHOOK_SECRET ?? '',
    timeoutMs: Number(process.env.N8N_TIMEOUT_MS ?? 8000),
    reintentos: Number(process.env.N8N_REINTENTOS ?? 1),
  };
}

/** Consumidores, barrido de reintentos y monitor de DLQ. No arrancan en pruebas (NODE_ENV=test) ni con SAGA_WORKERS=off. */
@Injectable()
class NotificacionesWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Notificaciones');
  private consumers: RabbitConsumer[] = [];
  private timer?: NodeJS.Timeout;
  private busy = false;
  private monitor?: DlqMonitor;

  constructor(
    private readonly service: NotificacionesService,
    @Inject(RabbitConnection) private readonly connection: RabbitConnection,
    @Inject('ALERTAS') private readonly alertas: AlertaPort,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.SAGA_WORKERS === 'off') return;
    const dedupe = () => new DynamoMessageDeduplicator(createDocClient(), process.env.PROCESSED_TABLE ?? 'ms8_processed_messages');
    const onLog = (m: string) => this.log.log(m);

    this.consumers.push(
      new RabbitConsumer(this.connection, {
        spec: queueSpec(QUEUE_COMANDOS),
        onLog,
        deduplicator: dedupe(),
        handler: async (env) => {
          const p = env.payload;
          const tipo = env.type === 'notificaciones.cita-confirmada.enviar' ? 'CITA_CONFIRMADA' : env.type === 'notificaciones.cita-cancelada.enviar' ? 'CITA_CANCELADA' : null;
          if (!tipo) return void this.log.warn(`comando ${env.type} desconocido; se ignora`);
          const n = await this.service.recibirComando({
            mensajeId: env.id,
            correlationId: env.correlationId,
            citaId: String(p.citaId),
            pacienteId: String(p.pacienteId),
            tipo,
            fechaHora: p.fechaHora ? String(p.fechaHora) : undefined,
            motivo: p.motivo ? String(p.motivo) : undefined,
          });
          this.log.log(`${env.type} cita=${n.citaId.slice(0, 8)} -> ${n.estado} (intentos ${n.intentos})`);
        },
      }),
      new RabbitConsumer(this.connection, {
        spec: queueSpec(QUEUE_EVENTOS),
        onLog,
        deduplicator: dedupe(),
        handler: async (env) => {
          const p = env.payload;
          if (env.type === 'cita.confirmada') {
            await this.service.registrarCitaConfirmada({ citaId: String(p.citaId), pacienteId: String(p.pacienteId), fechaHora: String(p.fechaHora) });
          } else if (env.type === 'paciente.creado' || env.type === 'paciente.actualizado') {
            await this.service.registrarContacto({ pacienteId: String(p.pacienteId), nombre: p.nombre ? String(p.nombre) : undefined, email: (p.email as string | null | undefined) ?? null });
          } else if (env.type === 'cita.cancelada') {
            await this.service.citaCancelada(String(p.citaId));
          } else if (env.type === 'cita.reprogramada') {
            await this.service.citaReprogramada({ citaId: String(p.citaId), pacienteId: String(p.pacienteId), fechaHora: String(p.fechaHora) });
          } else if (env.type === 'imagen.informe-validado') {
            // Un estudio descartado no genera aviso: no hay informe que ofrecer.
            if (p.validacion === 'VALIDADO') await this.service.estudioValidado({ imagenId: String(p.imagenId), pacienteId: String(p.pacienteId) });
          }
        },
      }),
    );
    for (const c of this.consumers) c.start().catch((e: Error) => this.log.warn(`consumidor: ${e.message}`));

    this.timer = setInterval(() => void this.barrer(), Number(process.env.NOTIF_SWEEP_MS ?? 2000));
    this.monitor = new DlqMonitor(this.connection, this.alertas);
    this.monitor.start(Number(process.env.DLQ_MONITOR_MS ?? 60_000));
    this.log.log('MS8: consumidores, barrido de reintentos y monitor de DLQ iniciados');
  }

  private async barrer() {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.service.reintentarPendientes();
      if (n > 0) this.log.log(`reintentos de notificacion procesados: ${n}`);
    } catch (e) {
      this.log.warn(`barrido: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.monitor?.stop();
    await Promise.all(this.consumers.map((c) => c.stop()));
  }
}

@Module({
  imports: [MessagingModule.forRoot()],
  controllers: [NotificacionesController, InternalController],
  providers: [
    InternalSecretGuard,
    {
      provide: 'SENDER',
      useFactory: (): NotificationSender => {
        const log = new Logger('Notificaciones');
        // n8n es el canal real; `simulated` queda solo como doble de pruebas / e2e de la SAGA.
        return (process.env.NOTIF_SENDER ?? 'n8n') === 'simulated' ? new SimulatedSender(process.env, (m) => log.log(m)) : new N8nSender(n8nOptions());
      },
    },
    {
      provide: 'ALERTAS',
      useFactory: (): AlertaPort => {
        const log = new Logger('Alertas');
        return (process.env.NOTIF_SENDER ?? 'n8n') === 'simulated' ? new LogAlerta((m) => log.warn(m)) : new N8nAlerta(n8nOptions(), (m) => log.warn(m));
      },
    },
    {
      provide: NotificacionesService,
      useFactory: (sender: NotificationSender, alertas: AlertaPort) => {
        const doc = createDocClient();
        const tablas = { notificaciones: process.env.NOTIFICACIONES_TABLE ?? 'notificaciones', outbox: process.env.OUTBOX_TABLE ?? 'ms8_outbox' };
        const log = new Logger('Notificaciones');
        return new NotificacionesService({
          sender,
          alertas,
          notificaciones: new DynamoNotificacionRepository(doc, tablas),
          contactos: new DynamoContactoRepository(doc, tablas),
          recordatorios: new DynamoRecordatorioRepository(doc, tablas),
          plantillas: new DynamoPlantillaRepository(doc, tablas),
          personal: new DynamoPreferenciasPersonalRepository(doc, tablas),
          newId: randomUUID,
          log: (m) => log.warn(m),
          config: {
            maxIntentos: Number(process.env.NOTIF_MAX_INTENTOS ?? 5),
            backoffBaseMs: Number(process.env.NOTIF_BACKOFF_BASE_MS ?? 30_000),
          },
        });
      },
      inject: ['SENDER', 'ALERTAS'],
    },
    NotificacionesWorkers,
  ],
})
export class NotificacionesModule {}
