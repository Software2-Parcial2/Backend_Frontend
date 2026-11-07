import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { ProblemException } from '@sigec/http-nest';
import { HorariosService } from '../../application/horarios/horarios.service.js';
import { traducir } from './errores.js';
import { BloqueoDto, GenerarHorariosDto, PlantillaDto } from './dto/agenda.dto.js';

/**
 * Horario semanal de un medico, publicacion de horarios y bloqueos (ausencias). Lo administra el administrador; lo consultan
 * recepcion y los medicos. Las horas de la plantilla son locales de la clinica (America/La_Paz).
 */
@ApiTags('horarios')
@ApiBearerAuth()
@Controller('api/citas/medicos/:medicoId')
export class HorariosController {
  constructor(private readonly horarios: HorariosService) {}

  @Get('horario')
  @Roles('administrador', 'recepcion', 'medico')
  plantilla(@Param('medicoId', new ParseUUIDPipe()) medicoId: string) {
    return this.horarios.plantilla(medicoId);
  }

  @Put('horario')
  @Roles('administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async guardar(@Param('medicoId', new ParseUUIDPipe()) medicoId: string, @Body() dto: PlantillaDto) {
    try {
      return await this.horarios.guardarPlantilla(medicoId, dto.duracionMin, dto.dias);
    } catch (e) {
      return traducir(e);
    }
  }

  /** Publica los horarios libres de la plantilla entre dos fechas (maximo 62 dias). Idempotente: los existentes no se tocan. */
  @Post('horario/generar')
  @HttpCode(200)
  @Roles('administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async generar(@Param('medicoId', new ParseUUIDPipe()) medicoId: string, @Body() dto: GenerarHorariosDto) {
    try {
      return await this.horarios.generar(medicoId, dto.desde, dto.hasta);
    } catch (e) {
      return traducir(e);
    }
  }

  @Get('bloqueos')
  @Roles('administrador', 'recepcion', 'medico')
  async bloqueos(@Param('medicoId', new ParseUUIDPipe()) medicoId: string) {
    return { items: await this.horarios.bloqueos(medicoId), siguiente: null };
  }

  /** Bloquea los horarios libres del rango y devuelve las citas que ya estaban dentro (hay que reprogramarlas: no se cancelan solas). */
  @Post('bloqueos')
  @Roles('administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async crearBloqueo(@Param('medicoId', new ParseUUIDPipe()) medicoId: string, @Body() dto: BloqueoDto, @CurrentUser() user?: AuthUser) {
    try {
      return await this.horarios.crearBloqueo(medicoId, dto.desde, dto.hasta, dto.motivo, user?.username ?? user?.sub ?? 'desconocido');
    } catch (e) {
      return traducir(e);
    }
  }

  @Delete('bloqueos/:id')
  @HttpCode(204)
  @Roles('administrador')
  async quitarBloqueo(@Param('medicoId', new ParseUUIDPipe()) medicoId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    const r = await this.horarios.eliminarBloqueo(medicoId, id);
    if (!r) throw new ProblemException(404, 'BLOQUEO_NO_ENCONTRADO', 'No encontrado', `No existe el bloqueo ${id}`);
  }
}
