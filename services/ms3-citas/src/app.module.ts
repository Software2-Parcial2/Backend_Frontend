import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { CitasModule } from './infrastructure/citas.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), CitasModule],
  controllers: [HealthController],
})
export class AppModule {}
