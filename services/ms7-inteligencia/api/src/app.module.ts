import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { AnalisisModule } from './infrastructure/inteligencia.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), AnalisisModule],
  controllers: [HealthController],
})
export class AppModule {}
