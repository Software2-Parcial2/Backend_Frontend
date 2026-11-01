import { Module } from '@nestjs/common';
import { ListarImagenesUseCase } from '../application/listar-imagenes.use-case.js';
import { ImagenesController } from './http/imagenes.controller.js';

@Module({
  controllers: [ImagenesController],
  providers: [{ provide: ListarImagenesUseCase, useFactory: () => new ListarImagenesUseCase() }],
})
export class ImagenesModule {}
