import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import mongoose, { type Connection } from 'mongoose';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer, RabbitPublisher } from '@sigec/messaging-nest';
import { ImagenesService } from '../application/imagenes.service.js';
import { Ms2PacienteGateway } from './http/ms2-paciente.gateway.js';
import { ImagenesController } from './http/imagenes.controller.js';
import { RabbitAnalisisPublisher } from './messaging/analisis.publisher.js';
import { MongoImagenRepository } from './persistence/mongo-imagen.repository.js';
import { S3ObjectStore } from './storage/s3-object-store.js';

const QUEUE = 'ms5.api.respuestas';
const MONGO = 'MONGO_CONNECTION';

/** Consumidor de las respuestas de la inferencia + barrido de imagenes atascadas. No arranca en pruebas (NODE_ENV=test) ni con SAGA_WORKERS=off. */
@Injectable()
class ImagenesWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Imagenes');
  private consumer?: RabbitConsumer;
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly service: ImagenesService,
    @Inject(RabbitConnection) private readonly connection: RabbitConnection,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.SAGA_WORKERS === 'off') return;
    // Idempotente por diseno: aplicarResultado/aplicarFallo solo transicionan desde SUBIDA/ANALIZANDO, asi que un mensaje
    // duplicado o tardio es un no-op. Los mensajes invalidos van a la DLQ (validacion Ajv de messaging-nest).
    this.consumer = new RabbitConsumer(this.connection, {
      spec: queueSpec(QUEUE),
      onLog: (m) => this.log.log(m),
      handler: async (env) => {
        const p = env.payload;
        if (env.type === 'imagenes.analisis.completado') {
          const aplicado = await this.service.aplicarResultado(String(p.imagenId), {
            probabilidad_neumonia: Number(p.probabilidad_neumonia),
            clase: p.clase as 'NEUMONIA' | 'NORMAL',
            version_modelo: String(p.version_modelo),
            modelo: String(p.modelo),
            aviso: String(p.aviso),
          });
          this.log.log(`${env.type} imagen=${String(p.imagenId).slice(0, 8)} -> ${aplicado ? 'aplicado' : 'ignorado'}`);
        } else if (env.type === 'imagenes.analisis.fallido') {
          const aplicado = await this.service.aplicarFallo(String(p.imagenId), String(p.motivo));
          this.log.log(`${env.type} imagen=${String(p.imagenId).slice(0, 8)} -> ${aplicado ? 'aplicado' : 'ignorado'}`);
        }
      },
    });
    this.consumer.start().catch((e: Error) => this.log.warn(`consumidor: ${e.message}`));
    this.timer = setInterval(() => void this.barrer(), Number(process.env.IMAGENES_SWEEP_MS ?? 10_000));
  }

  private async barrer() {
    if (this.busy) return;
    this.busy = true;
    try {
      const n = await this.service.reintentarAtascadas();
      if (n > 0) this.log.log(`imagenes atascadas procesadas: ${n}`);
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
  controllers: [ImagenesController],
  providers: [
    {
      provide: MONGO,
      // Conexion perezosa: no abre nada hasta la primera operacion (pruebas e2e sin Mongo no fallan al arrancar).
      useFactory: (): Connection => mongoose.createConnection(process.env.MONGO_URL ?? 'mongodb://localhost:27017/sigec_imagenes', { serverSelectionTimeoutMS: 5000 }),
    },
    {
      provide: ImagenesService,
      useFactory: (mongo: Connection, publisher: RabbitPublisher) => {
        const log = new Logger('Imagenes');
        return new ImagenesService({
          repo: new MongoImagenRepository(mongo),
          store: new S3ObjectStore({
            endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
            publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
            region: process.env.AWS_REGION ?? 'sa-east-1',
            accessKeyId: process.env.S3_ACCESS_KEY ?? '',
            secretAccessKey: process.env.S3_SECRET_KEY ?? '',
          }),
          pacientes: new Ms2PacienteGateway(process.env.MS2_URL ?? 'http://localhost:8082'),
          publisher: new RabbitAnalisisPublisher(publisher),
          newId: randomUUID,
          randomKey: () => randomBytes(32).toString('hex'),
          log: (m) => log.warn(m),
          config: {
            bucket: process.env.S3_BUCKET_RADIOGRAFIAS ?? 'radiografias',
            maxBytes: Number(process.env.IMAGENES_MAX_BYTES ?? 15 * 1024 * 1024),
            urlSegundos: Number(process.env.IMAGENES_URL_SEGUNDOS ?? 300),
            analisisTimeoutMs: Number(process.env.IMAGENES_ANALISIS_TIMEOUT_MS ?? 120_000),
            maxEnvios: Number(process.env.IMAGENES_MAX_ENVIOS ?? 5),
          },
        });
      },
      inject: [MONGO, RabbitPublisher],
    },
    ImagenesWorkers,
  ],
})
export class ImagenesModule {}
