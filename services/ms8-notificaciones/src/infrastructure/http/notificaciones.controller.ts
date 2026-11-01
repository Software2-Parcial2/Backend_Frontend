import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListarNotificacionesUseCase } from '../../application/listar-notificaciones.use-case.js';
import type { Notificacion } from '../../domain/notificacion.js';

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(private readonly listar: ListarNotificacionesUseCase) {}

  @Get()
  listarNotificaciones(): Notificacion[] {
    return this.listar.ejecutar();
  }
}
