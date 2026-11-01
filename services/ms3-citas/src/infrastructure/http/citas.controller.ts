import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Roles } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { ListarCitasUseCase } from '../../application/listar-citas.use-case.js';
import { SolicitarCitaUseCase } from '../../application/solicitar-cita.use-case.js';
import type { Cita } from '../../domain/cita.js';
import { SolicitarCitaDto } from './dto/solicitar-cita.dto.js';

@ApiTags('citas')
@ApiBearerAuth()
@Controller('api/citas')
export class CitasController {
  constructor(
    private readonly listar: ListarCitasUseCase,
    private readonly solicitar: SolicitarCitaUseCase,
  ) {}

  @Get()
  listarCitas(): Cita[] {
    return this.listar.ejecutar();
  }

  @Post()
  @HttpCode(202)
  @Roles('recepcion', 'paciente', 'administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  crear(@Body() dto: SolicitarCitaDto) {
    return this.solicitar.ejecutar(dto);
  }
}
