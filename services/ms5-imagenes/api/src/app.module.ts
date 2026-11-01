import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { HealthController } from './infrastructure/http/health.controller.js';
import { ImagenesModule } from './infrastructure/imagenes.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), ImagenesModule],
  controllers: [HealthController],
})
export class AppModule {}
