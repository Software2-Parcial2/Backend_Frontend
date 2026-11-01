import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListarImagenesUseCase } from '../../application/listar-imagenes.use-case.js';
import type { Imagen } from '../../domain/imagen.js';

@ApiTags('imagenes')
@ApiBearerAuth()
@Controller('api/imagenes')
export class ImagenesController {
  constructor(private readonly listar: ListarImagenesUseCase) {}

  @Get()
  listarImagenes(): Imagen[] {
    return this.listar.ejecutar();
  }
}
