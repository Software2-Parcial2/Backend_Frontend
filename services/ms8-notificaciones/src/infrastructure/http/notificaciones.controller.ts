import { Controller, Get, Inject, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '@sigec/auth-nest';
import type { NotificacionRepository } from '../../application/enviar-notificacion.use-case.js';
import type { Notificacion } from '../../domain/notificacion.js';
import { NOTIFICACION_REPOSITORY } from '../notificaciones.tokens.js';

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(@Inject(NOTIFICACION_REPOSITORY) private readonly repo: NotificacionRepository) {}

  /** Notificaciones de una cita (sin citaId devuelve []). */
  @Get()
  @Roles('administrador', 'recepcion', 'medico')
  @ApiQuery({ name: 'citaId', required: false })
  async listar(@Query('citaId', new ParseUUIDPipe({ optional: true })) citaId?: string): Promise<Notificacion[]> {
    return citaId ? this.repo.porCita(citaId) : [];
  }
}
