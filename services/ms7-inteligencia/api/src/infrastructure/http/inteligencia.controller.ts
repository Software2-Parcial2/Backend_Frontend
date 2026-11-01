import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListarAnalisisUseCase } from '../../application/listar-inteligencia.use-case.js';
import type { Analisis } from '../../domain/analisis.js';

@ApiTags('inteligencia')
@ApiBearerAuth()
@Controller('api/inteligencia')
export class AnalisisController {
  constructor(private readonly listar: ListarAnalisisUseCase) {}

  @Get()
  listarAnalisis(): Analisis[] {
    return this.listar.ejecutar();
  }
}
