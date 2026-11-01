import { Module } from '@nestjs/common';
import { ListarNotificacionesUseCase } from '../application/listar-notificaciones.use-case.js';
import { NotificacionesController } from './http/notificaciones.controller.js';

@Module({
  controllers: [NotificacionesController],
  providers: [{ provide: ListarNotificacionesUseCase, useFactory: () => new ListarNotificacionesUseCase() }],
})
export class NotificacionesModule {}
