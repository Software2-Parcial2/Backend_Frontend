import { DynamicModule, Global, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { RabbitConnection } from './connection.js';
import { RabbitPublisher } from './publisher.js';
import { declareExchanges } from './topology.js';

export const RABBIT_URL = Symbol('SIGEC_RABBIT_URL');

@Injectable()
export class RabbitLifecycle implements OnApplicationShutdown {
  constructor(public readonly connection: RabbitConnection) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}

/** URL AMQP por defecto desde el entorno (RABBITMQ_URL o RABBITMQ_USER/PASSWORD en localhost). */
export function rabbitUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.RABBITMQ_URL ??
    `amqp://${encodeURIComponent(env.RABBITMQ_USER ?? 'sigec')}:${encodeURIComponent(env.RABBITMQ_PASSWORD ?? 'cambia_esto')}@${env.RABBITMQ_HOST ?? 'localhost'}:${env.RABBITMQ_PORT ?? '5672'}`
  );
}

@Global()
@Module({})
export class MessagingModule {
  static forRoot(options: { url?: string } = {}): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        {
          provide: RabbitConnection,
          useFactory: () => new RabbitConnection({ url: options.url ?? rabbitUrlFromEnv() }),
        },
        {
          provide: RabbitPublisher,
          useFactory: (c: RabbitConnection) => new RabbitPublisher(c),
          inject: [RabbitConnection],
        },
        RabbitLifecycle,
      ],
      exports: [RabbitConnection, RabbitPublisher],
    };
  }
}

export { declareExchanges };
