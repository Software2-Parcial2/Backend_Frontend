import { randomInt } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { NotificacionesService } from '../../application/notificaciones.service.js';
import { PreferenciasInvalidasError } from '../../domain/notificacion.js';
import { PreferenciasDto, VinculoDto } from './dto.js';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L: el paciente lo teclea en el movil
const codigo = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const STAFF = ['administrador', 'recepcion'];

/** El personal gestiona a cualquier paciente; un paciente solo a si mismo (claim paciente_id). */
function autorizar(user: AuthUser | undefined, pacienteId: string) {
  if (user?.roles.some((r) => STAFF.includes(r))) return;
  if (user?.roles.includes('paciente') && user.pacienteId === pacienteId) return;
  throw new ForbiddenException('Solo puedes gestionar tus propias preferencias');
}

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  /** Notificaciones de una cita (sin citaId devuelve []). */
  @Get()
  @Roles('administrador', 'recepcion', 'medico')
  @ApiQuery({ name: 'citaId', required: false })
  listar(@Query('citaId', new ParseUUIDPipe({ optional: true })) citaId?: string) {
    return citaId ? this.service.porCita(citaId) : [];
  }

  @Get('preferencias/:pacienteId')
  async preferencias(@Param('pacienteId', new ParseUUIDPipe()) pacienteId: string, @CurrentUser() user?: AuthUser) {
    autorizar(user, pacienteId);
    const c = await this.service.obtenerPreferencias(pacienteId);
    return { pacienteId, canales: c.canales, email: c.email ?? null, telegramVinculado: !!c.telegramChatId };
  }

  @Put('preferencias/:pacienteId')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async guardarPreferencias(@Param('pacienteId', new ParseUUIDPipe()) pacienteId: string, @Body() dto: PreferenciasDto, @CurrentUser() user?: AuthUser) {
    autorizar(user, pacienteId);
    try {
      const c = await this.service.guardarPreferencias(pacienteId, dto.canales);
      return { pacienteId, canales: c.canales, telegramVinculado: !!c.telegramChatId };
    } catch (e) {
      if (e instanceof PreferenciasInvalidasError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  /** Genera un codigo de un solo uso (10 min) para vincular Telegram: el paciente escribe `/start <codigo>` al bot. */
  @Post('telegram/vinculo')
  @HttpCode(201)
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async vinculo(@Body() dto: VinculoDto, @CurrentUser() user?: AuthUser) {
    const pacienteId = dto.pacienteId ?? user?.pacienteId;
    if (!pacienteId) throw new BadRequestException('Indica pacienteId (el usuario no esta vinculado a un paciente)');
    autorizar(user, pacienteId);
    const r = await this.service.generarCodigoVinculo(pacienteId, codigo());
    return { ...r, instruccion: `Abre el bot de SIGEC en Telegram y envia: /start ${r.codigo}`, bot: process.env.TELEGRAM_BOT_USERNAME ?? null };
  }
}
