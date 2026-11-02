import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@sigec/auth-nest';
import { IsBoolean, IsOptional } from 'class-validator';
import { RagService } from '../../application/rag/rag.service.js';
import { traducir } from '../errores.js';

export class ReindexarDto {
  @IsOptional() @IsBoolean() forzar?: boolean;
}

@ApiTags('inteligencia')
@ApiBearerAuth()
@Controller('api/inteligencia/rag')
export class RagController {
  constructor(@Inject(RagService) private readonly rag: RagService) {}

  /** Reindexa docs/rag (solo los documentos cambiados, o todos con `forzar`). Solo administrador. */
  @Post('reindexar')
  @Roles('administrador')
  reindexar(@Body() dto: ReindexarDto) {
    return traducir(this.rag.reindexar(dto.forzar ?? false));
  }

  @Get('estado')
  @Roles('administrador')
  estado() {
    return traducir(this.rag.estado());
  }
}
