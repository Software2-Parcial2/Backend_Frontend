import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { NotificacionesModule } from './infrastructure/notificaciones.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), NotificacionesModule],
  controllers: [HealthController],
})
export class AppModule {}
