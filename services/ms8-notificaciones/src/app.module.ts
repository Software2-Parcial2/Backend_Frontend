import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { IdempotencyModule } from '@sigec/idempotency-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { NotificacionesModule } from './infrastructure/notificaciones.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), IdempotencyModule.forRoot({ tableName: process.env.IDEMPOTENCY_TABLE ?? 'ms8_idempotency_keys' }), NotificacionesModule],
  controllers: [HealthController],
})
export class AppModule {}
