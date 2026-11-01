import { Module } from '@nestjs/common';
import { ListarCitasUseCase } from '../application/listar-citas.use-case.js';
import { SolicitarCitaUseCase } from '../application/solicitar-cita.use-case.js';
import { CitasController } from './http/citas.controller.js';

@Module({
  controllers: [CitasController],
  providers: [
    { provide: ListarCitasUseCase, useFactory: () => new ListarCitasUseCase() },
    { provide: SolicitarCitaUseCase, useFactory: () => new SolicitarCitaUseCase() },
  ],
})
export class CitasModule {}
