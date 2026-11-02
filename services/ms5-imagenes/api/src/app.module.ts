import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { IdempotencyModule } from '@sigec/idempotency-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { ImagenesModule } from './infrastructure/imagenes.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), IdempotencyModule.forRoot({ tableName: process.env.IDEMPOTENCY_TABLE ?? 'ms5_idempotency_keys' }), ImagenesModule],
  controllers: [HealthController],
})
export class AppModule {}
