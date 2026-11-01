import { DynamicModule, Global, Module } from '@nestjs/common';
import { createDocClient } from './dynamo.js';
import { DynamoIdempotencyStore } from './dynamo.store.js';
import { IDEMPOTENCY_SERVICE, IdempotencyInterceptor } from './idempotency.interceptor.js';
import { IdempotencyService } from './idempotency.service.js';
import type { IdempotencyStore } from './types.js';

export interface IdempotencyModuleOptions {
  /** Tabla DynamoDB; por defecto IDEMPOTENCY_TABLE o "idempotency_keys". */
  tableName?: string;
  /** Almacen alternativo (pruebas). */
  store?: IdempotencyStore;
  ttlMs?: number;
}

@Global()
@Module({})
export class IdempotencyModule {
  static forRoot(options: IdempotencyModuleOptions = {}): DynamicModule {
    return {
      module: IdempotencyModule,
      providers: [
        {
          provide: IDEMPOTENCY_SERVICE,
          useFactory: () =>
            new IdempotencyService(
              options.store ??
                new DynamoIdempotencyStore(createDocClient(), options.tableName ?? process.env.IDEMPOTENCY_TABLE ?? 'idempotency_keys'),
              { ttlMs: options.ttlMs },
            ),
        },
        IdempotencyInterceptor,
      ],
      exports: [IDEMPOTENCY_SERVICE, IdempotencyInterceptor],
    };
  }
}
