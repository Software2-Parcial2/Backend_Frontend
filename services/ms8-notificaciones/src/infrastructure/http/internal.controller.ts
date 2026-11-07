import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@sigec/auth-nest';
import { NotificacionesService } from '../../application/notificaciones.service.js';
import { VinculoInvalidoError } from '../../domain/notificacion.js';
import { VincularTelegramDto } from './dto.js';
import { InternalSecretGuard } from './internal-secret.guard.js';

/** Endpoints que llama n8n. No estan expuestos por el gateway (solo /api/**) y se protegen con un secreto compartido. */
@Public()
@UseGuards(InternalSecretGuard)
@ApiExcludeController()
@Controller('internal')
export class InternalController {
  constructor(private readonly service: NotificacionesService) {}

  /** El bot recibio `/start <codigo>`: asocia el chat con el paciente. */
  @Post('telegram/vincular')
  @HttpCode(200)
  async vincular(@Body() dto: VincularTelegramDto) {
    try {
      const { pacienteId } = await this.service.vincularTelegram(dto.codigo, dto.chatId);
      return { ok: true, pacienteId };
    } catch (e) {
      if (e instanceof VinculoInvalidoError) throw new NotFoundException({ ok: false, error: e.message });
      throw e;
    }
  }

  @Get('recordatorios/pendientes')
  async pendientes(@Query('horas') horas?: string) {
    return { citas: await this.service.recordatoriosPendientes(Number(horas) > 0 ? Number(horas) : 24) };
  }

  @Post('recordatorios/:citaId/enviar')
  @HttpCode(200)
  async enviar(@Param('citaId', new ParseUUIDPipe()) citaId: string) {
    const n = await this.service.enviarRecordatorio(citaId);
    if (!n) throw new NotFoundException({ ok: false, error: 'cita desconocida' });
    if (n === 'OMITIDO') return { ok: true, estado: 'OMITIDO', intentos: 0 };
    return { ok: true, estado: n.estado, intentos: n.intentos };
  }

  /** Recordatorio extra para una cita (p. ej. MS7 ante un riesgo alto de inasistencia). Uno por cita: repetirlo no reenvia. */
  @Post('recordatorios/:citaId/reforzar')
  @HttpCode(200)
  async reforzar(@Param('citaId', new ParseUUIDPipe()) citaId: string) {
    const n = await this.service.reforzarRecordatorio(citaId);
    if (!n) throw new NotFoundException({ ok: false, error: 'cita desconocida' });
    if (n === 'OMITIDO') return { ok: true, estado: 'OMITIDO', intentos: 0 };
    return { ok: true, estado: n.estado, intentos: n.intentos };
  }
}
