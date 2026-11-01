import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListarCitasUseCase } from '../../application/listar-citas.use-case.js';
import type { Cita } from '../../domain/cita.js';

@ApiTags('citas')
@ApiBearerAuth()
@Controller('api/citas')
export class CitasController {
  constructor(private readonly listar: ListarCitasUseCase) {}

  @Get()
  listarCitas(): Cita[] {
    return this.listar.ejecutar();
  }
}
