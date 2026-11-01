import { Module } from '@nestjs/common';
import { ListarAnalisisUseCase } from '../application/listar-inteligencia.use-case.js';
import { AnalisisController } from './http/inteligencia.controller.js';

@Module({
  controllers: [AnalisisController],
  providers: [{ provide: ListarAnalisisUseCase, useFactory: () => new ListarAnalisisUseCase() }],
})
export class AnalisisModule {}
