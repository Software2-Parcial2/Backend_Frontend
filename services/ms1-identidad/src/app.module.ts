import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { IdentidadModule } from './infrastructure/identidad.module.js';

@Module({
  imports: [TerminusModule, AuthModule.forRoot(), IdentidadModule],
})
export class AppModule {}
