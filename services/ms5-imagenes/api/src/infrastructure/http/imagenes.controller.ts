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
import { ProblemException } from '@sigec/http-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { ImagenesService } from '../../application/imagenes.service.js';
import { ArchivoInvalidoError, AVISO_CLINICO, PacienteInexistenteError, ReglaImagenError, ServicioNoDisponibleError, type Imagen } from '../../domain/imagen.js';
import { CursorInvalidoError } from '../persistence/mongo-imagen.repository.js';
import { ListarImagenesDto, SubirImagenDto, ValidarImagenDto } from './dto.js';

const MAX_BYTES = Number(process.env.IMAGENES_MAX_BYTES ?? 15 * 1024 * 1024);
const STAFF = ['medico', 'administrador'];

/** Token Bearer del usuario (para consultar a MS2 en su nombre). */
const Token = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => String(ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>().headers.authorization ?? ''));

/** Un paciente (sin rol de personal) esta restringido a sus propias imagenes. */
/** Errores de regla de las imagenes -> problem+json con code estable (se traduce en el controlador para que la idempotencia guarde los 4xx). */
function traducir(e: unknown): never {
  if (e instanceof ReglaImagenError) {
    const titulo = e.status === 404 ? 'No encontrado' : e.status === 409 ? 'Conflicto' : 'Regla de negocio incumplida';
    throw new ProblemException(e.status, e.code, titulo, e.message);
  }
  throw e;
}

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
    origen: i.origen,
    validacion: i.validacion,
    observaciones: i.observaciones ?? null,
    pacienteNombre: i.pacienteNombre ?? null,
    numeroHistoria: i.numeroHistoria ?? null,
    tieneGradcam: !!i.gradcamKey,
    informe: i.informe
      ? {
          decision: i.informe.decision,
          texto: i.informe.texto,
          validadoPor: i.informe.validadoPor,
          validadoEn: new Date(i.informe.validadoEn).toISOString(),
          huella: i.informe.huella,
          versionModelo: i.informe.versionModelo,
        }
      : null,
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
  @Roles('medico', 'administrador', 'paciente')
  @Idempotent()
  // El interceptor de archivos va primero (el ultimo decorador se aplica antes): la idempotencia necesita el archivo ya leido.
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  @ApiBody({ schema: { type: 'object', required: ['archivo'], properties: { archivo: { type: 'string', format: 'binary' }, pacienteId: { type: 'string', format: 'uuid', description: 'Obligatorio para el personal; un paciente sube siempre a su nombre' }, estudio: { type: 'string' }, observaciones: { type: 'string' } } } })
  async subir(@UploadedFile() archivo: { buffer: Buffer } | undefined, @Body() dto: SubirImagenDto, @CurrentUser() user: AuthUser | undefined, @Token() token: string) {
    if (!archivo) throw new BadRequestException('Falta el archivo (campo multipart "archivo")');
    const propio = esSoloPaciente(user);
    let pacienteId = dto.pacienteId;
    if (propio) {
      if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
      if (pacienteId && pacienteId !== user.pacienteId) throw new ForbiddenException('Solo puedes subir estudios a tu nombre');
      pacienteId = user.pacienteId;
    }
    if (!pacienteId) throw new BadRequestException('Indica pacienteId');
    try {
      const imagen = await this.service.subir({
        pacienteId,
        estudio: dto.estudio ?? 'radiografia-torax',
        observaciones: dto.observaciones,
        origen: propio ? 'PACIENTE' : 'MEDICO',
        archivo: archivo.buffer,
        usuarioId: user?.sub ?? 'desconocido',
        token,
      });
      return toView(imagen);
    } catch (e) {
      // HttpException para que la idempotencia guarde las respuestas 4xx (deterministas).
      if (e instanceof ArchivoInvalidoError) throw new BadRequestException(e.message);
      if (e instanceof PacienteInexistenteError) throw new NotFoundException(e.message);
      if (e instanceof ServicioNoDisponibleError) throw new ServiceUnavailableException(e.message);
      return traducir(e);
    }
  }

  /**
   * Estudios, mas recientes primero: `?pacienteId&validacion=PENDIENTE|VALIDADO|DESCARTADO&estado=<analisis>&q&limite&cursor`.
   * El personal puede listar sin `pacienteId` (bandeja de validacion). Un paciente solo ve los suyos y ya validados.
   */
  @Get()
  @Roles('medico', 'administrador', 'paciente')
  async listar(@Query() q: ListarImagenesDto, @CurrentUser() user?: AuthUser) {
    let pacienteId = q.pacienteId;
    let validacion = q.validacion;
    if (esSoloPaciente(user)) {
      if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
      if (pacienteId && pacienteId !== user.pacienteId) throw new ForbiddenException('Solo puedes consultar tus propias imagenes');
      pacienteId = user.pacienteId;
      validacion = 'VALIDADO';
    }
    try {
      const p = await this.service.listar({ pacienteId, validacion, estado: q.estado, q: q.q }, q.limite ?? 20, q.cursor);
      return { items: p.items.map(toView), siguiente: p.siguiente, aviso: AVISO_CLINICO };
    } catch (e) {
      if (e instanceof CursorInvalidoError) throw new ProblemException(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
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

  /** URL prefirmada temporal del mapa de calor (Grad-CAM). 404 `GRADCAM_NO_DISPONIBLE` si la inferencia no lo genero. */
  @Get(':id/gradcam-url')
  @Roles('medico', 'administrador', 'paciente')
  async gradcam(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    try {
      return await this.service.urlGradcam(await this.visible(id, user));
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Validacion medica del informe de la IA: `CONFIRMA`, `MODIFICA` (con el texto corregido) o `DESCARTA` (con el motivo).
   * Solo sobre estudios ya analizados y pendientes. Firma con la huella del contenido y publica `imagen.informe-validado`.
   */
  @Post(':id/validacion')
  @HttpCode(200)
  @Roles('medico')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async validar(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ValidarImagenDto, @CurrentUser() user?: AuthUser) {
    try {
      return toView(await this.service.validar({ imagenId: id, decision: dto.decision, texto: dto.informe, usuarioId: user?.sub ?? 'desconocido', medicoId: user?.medicoId ?? null }));
    } catch (e) {
      return traducir(e);
    }
  }

  /** Para un paciente, la imagen ajena (o aun sin validar) es indistinguible de una inexistente (404). */
  private async visible(id: string, user?: AuthUser): Promise<Imagen> {
    const i = await this.service.obtener(id);
    if (!i || (esSoloPaciente(user) && (i.pacienteId !== user?.pacienteId || i.validacion !== 'VALIDADO'))) throw new NotFoundException(`No existe la imagen ${id}`);
    return i;
  }
}
