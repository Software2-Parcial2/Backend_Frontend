import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { IdempotencyModule } from '@sigec/idempotency-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { CitasModule } from './infrastructure/saga/saga.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), IdempotencyModule.forRoot(), CitasModule],
  controllers: [HealthController],
})
export class AppModule {}
