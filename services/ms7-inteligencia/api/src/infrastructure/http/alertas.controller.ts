import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { ProblemException } from '@sigec/http-nest';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AlertasService } from '../../application/alertas/alertas.service.js';
import { AgenteInvalidoError, AlertaNoEncontradaError, AlertaYaAtendidaError } from '../../application/alertas/tipos.js';
import { GestionService } from '../../application/gestion.service.js';
import type { Identidad } from '../../domain/gestion.js';
import { traducir as traducirGestion } from '../errores.js';
import { CursorInvalidoError } from '../alertas/pg-alertas.repository.js';

class ListarAlertasDto {
  @IsOptional() @IsIn(['ABIERTA', 'ATENDIDA']) estado?: 'ABIERTA' | 'ATENDIDA';
  @IsOptional() @IsIn(['BAJO', 'MEDIO', 'ALTO']) nivel?: 'BAJO' | 'MEDIO' | 'ALTO';
  @IsOptional() @IsIn(['cancelaciones', 'inasistencias', 'demanda', 'ingresos']) agente?: 'cancelaciones' | 'inasistencias' | 'demanda' | 'ingresos';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

class AtenderDto {
  @IsOptional() @IsString() @MaxLength(1000) nota?: string;
}

class ActualizarAgenteDto {
  @IsOptional() @IsBoolean() activo?: boolean;
  /** Minutos entre ejecuciones (5 a 1440). */
  @IsOptional() @IsInt() @Min(5) @Max(1440) intervaloMin?: number;
  /** Umbral del agente; su significado esta en la descripcion de cada uno. */
  @IsOptional() @IsNumber() @Min(0.001) @Max(1000) umbral?: number;
}

/** Errores de dominio -> problem+json con code estable. */
async function traducir<T>(p: Promise<T>): Promise<T> {
  try {
    return await traducirGestion(p);
  } catch (e) {
    if (e instanceof AlertaNoEncontradaError) throw new ProblemException(404, 'ALERTA_NO_ENCONTRADA', 'No encontrado', e.message);
    if (e instanceof AlertaYaAtendidaError) throw new ProblemException(409, 'ALERTA_YA_ATENDIDA', 'Conflicto', e.message);
    if (e instanceof AgenteInvalidoError) throw new ProblemException(422, 'AGENTE_INVALIDO', 'Regla de negocio incumplida', e.message);
    if (e instanceof CursorInvalidoError) throw new ProblemException(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
    throw e;
  }
}

const identidadDe = (user: AuthUser | undefined, authorization: string | undefined): Identidad => ({
  token: authorization?.replace(/^Bearer\s+/i, '') ?? '',
  roles: user?.roles ?? [],
  usuario: user?.username ?? user?.sub ?? 'desconocido',
});

@ApiTags('inteligencia')
@ApiBearerAuth()
@Controller('api/inteligencia')
export class AlertasController {
  constructor(
    private readonly alertas: AlertasService,
    private readonly gestion: GestionService,
  ) {}

  /** Alertas de los agentes de monitoreo, mas recientes primero: `?estado&nivel&agente&limite&cursor`. */
  @Get('alertas')
  @Roles('administrador', 'recepcion')
  listar(@Query() q: ListarAlertasDto) {
    return traducir(this.alertas.listarAlertas({ estado: q.estado, nivel: q.nivel, agenteId: q.agente }, q.limite ?? 25, q.cursor));
  }

  @Get('alertas/:id')
  @Roles('administrador', 'recepcion')
  obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return traducir(this.alertas.obtenerAlerta(id));
  }

  /** Marca la alerta como atendida (quien y cuando quedan registrados). 409 `ALERTA_YA_ATENDIDA` si ya lo estaba. */
  @Post('alertas/:id/atender')
  @HttpCode(200)
  @Roles('administrador', 'recepcion')
  atender(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AtenderDto, @CurrentUser() user?: AuthUser) {
    return traducir(this.alertas.atender(id, user?.username ?? user?.sub ?? 'desconocido', dto.nota));
  }

  @Get('agentes')
  @Roles('administrador', 'recepcion')
  async agentes() {
    return { items: await traducir(this.alertas.listarAgentes()) };
  }

  /** Activa o desactiva un agente y ajusta su intervalo o umbral. */
  @Put('agentes/:id')
  @Roles('administrador')
  actualizarAgente(@Param('id') id: string, @Body() dto: ActualizarAgenteDto) {
    return traducir(this.alertas.actualizarAgente(id, dto));
  }

  /** Ejecuta el agente ahora con el token de quien lo pide (los programados usan la identidad de servicio). */
  @Post('agentes/:id/ejecutar')
  @HttpCode(200)
  @Roles('administrador')
  ejecutar(@Param('id') id: string, @CurrentUser() user?: AuthUser, @Headers('authorization') authorization?: string) {
    return traducir(this.alertas.ejecutar(id, identidadDe(user, authorization)));
  }

  /** Modelo de inasistencia en uso: version, fuente de datos e importancia de cada variable. */
  @Get('ml/modelo')
  @Roles('administrador', 'recepcion')
  modelo() {
    return traducir(this.gestion.modeloInfo());
  }
}

