import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { ImagenesService } from '../../application/imagenes.service.js';
import { ArchivoInvalidoError, AVISO_CLINICO, PacienteInexistenteError, ServicioNoDisponibleError, type Imagen } from '../../domain/imagen.js';
import { CursorInvalidoError } from '../persistence/mongo-imagen.repository.js';
import { ListarImagenesDto, SubirImagenDto } from './dto.js';

const MAX_BYTES = Number(process.env.IMAGENES_MAX_BYTES ?? 15 * 1024 * 1024);
const STAFF = ['medico', 'administrador'];

/** Token Bearer del usuario (para consultar a MS2 en su nombre). */
const Token = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => String(ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>().headers.authorization ?? ''));

/** Un paciente (sin rol de personal) esta restringido a sus propias imagenes. */
const esSoloPaciente = (u?: AuthUser) => !!u && u.roles.includes('paciente') && !u.roles.some((r) => STAFF.includes(r));

/** Vista publica: nunca expone el bucket ni la clave del objeto. */
export function toView(i: Imagen) {
  return {
    id: i.id,
    pacienteId: i.pacienteId,
    estudio: i.estudio,
    estado: i.estado,
    hashSha256: i.hashSha256,
    mime: i.mime,
    bytes: i.bytes,
    usuarioId: i.usuarioId,
    resultado: i.resultado ?? null,
    error: i.error ?? null,
    aviso: AVISO_CLINICO,
    creadaEn: new Date(i.creadaEn).toISOString(),
    actualizadaEn: new Date(i.actualizadaEn).toISOString(),
  };
}

@ApiTags('imagenes')
@ApiBearerAuth()
@Controller('api/imagenes')
export class ImagenesController {
  constructor(private readonly service: ImagenesService) {}

  /**
   * Sube una radiografia (multipart: `archivo` + `pacienteId` + `estudio`). Valida la FIRMA real del archivo (JPEG/PNG/DICOM),
   * el tamano maximo y que el paciente exista; la guarda en S3 con clave no adivinable y encola el analisis.
   * El resultado de la IA es apoyo a la decision, no un diagnostico.
   */
  @Post()
  @HttpCode(201)
  @Roles('medico', 'administrador')
  @Idempotent()
  // El interceptor de archivos va primero (el ultimo decorador se aplica antes): la idempotencia necesita el archivo ya leido.
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  @ApiBody({ schema: { type: 'object', required: ['archivo', 'pacienteId'], properties: { archivo: { type: 'string', format: 'binary' }, pacienteId: { type: 'string', format: 'uuid' }, estudio: { type: 'string' } } } })
  async subir(@UploadedFile() archivo: { buffer: Buffer } | undefined, @Body() dto: SubirImagenDto, @CurrentUser() user: AuthUser | undefined, @Token() token: string) {
    if (!archivo) throw new BadRequestException('Falta el archivo (campo multipart "archivo")');
    try {
      const imagen = await this.service.subir({ pacienteId: dto.pacienteId, estudio: dto.estudio ?? 'radiografia-torax', archivo: archivo.buffer, usuarioId: user?.sub ?? 'desconocido', token });
      return toView(imagen);
    } catch (e) {
      // HttpException para que la idempotencia guarde las respuestas 4xx (deterministas).
      if (e instanceof ArchivoInvalidoError) throw new BadRequestException(e.message);
      if (e instanceof PacienteInexistenteError) throw new NotFoundException(e.message);
      if (e instanceof ServicioNoDisponibleError) throw new ServiceUnavailableException(e.message);
      throw e;
    }
  }

  /** Imagenes de un paciente (mas recientes primero), con `limite` y `cursor`. Un paciente solo ve las suyas. */
  @Get()
  @Roles('medico', 'administrador', 'paciente')
  async listar(@Query() q: ListarImagenesDto, @CurrentUser() user?: AuthUser) {
    let pacienteId = q.pacienteId;
    if (esSoloPaciente(user)) {
      if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
      if (pacienteId && pacienteId !== user.pacienteId) throw new ForbiddenException('Solo puedes consultar tus propias imagenes');
      pacienteId = user.pacienteId;
    }
    if (!pacienteId) throw new BadRequestException('Indica pacienteId');
    try {
      const p = await this.service.listar(pacienteId, q.limite ?? 20, q.cursor);
      return { items: p.items.map(toView), siguiente: p.siguiente, aviso: AVISO_CLINICO };
    } catch (e) {
      if (e instanceof CursorInvalidoError) throw new BadRequestException('cursor invalido');
      throw e;
    }
  }

  @Get(':id')
  @Roles('medico', 'administrador', 'paciente')
  async obtener(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return toView(await this.visible(id, user));
  }

  /** URL prefirmada temporal para ver la imagen (el bucket nunca es publico). */
  @Get(':id/url')
  @Roles('medico', 'administrador', 'paciente')
  async url(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return this.service.urlTemporal(await this.visible(id, user));
  }

  /** Para un paciente, la imagen ajena es indistinguible de una inexistente (404). */
  private async visible(id: string, user?: AuthUser): Promise<Imagen> {
    const i = await this.service.obtener(id);
    if (!i || (esSoloPaciente(user) && i.pacienteId !== user?.pacienteId)) throw new NotFoundException(`No existe la imagen ${id}`);
    return i;
  }
}
