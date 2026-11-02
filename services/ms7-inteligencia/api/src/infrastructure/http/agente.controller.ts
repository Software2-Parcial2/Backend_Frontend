import { Body, Controller, Get, Inject, Post, Query, Req, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { AgenteService } from '../../application/agente/agente.service.js';
import { AUDITORIA_PORT, type AuditoriaPort } from '../../application/agente/ports.js';
import { ReportesService } from '../../application/reportes/reportes.service.js';
import { aCsv, aPdf, aXlsx } from '../../application/reportes/exportadores.js';
import { ROLES_GESTION } from '../../application/roles.js';
import { ConsultaInvalidaError, type Identidad } from '../../domain/gestion.js';
import { traducir } from '../errores.js';

export class ConsultaAgenteDto {
  @IsString() @MinLength(3) @MaxLength(1000) texto!: string;
}

export class AuditoriaQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
}

export function identidadDeReq(req: { headers: { authorization?: string } }, user?: AuthUser): Identidad {
  return { token: req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '', roles: user?.roles ?? [], usuario: user?.username ?? user?.sub ?? 'desconocido' };
}

const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
} as const;

@ApiTags('inteligencia')
@ApiBearerAuth()
@Controller('api/inteligencia')
export class AgenteController {
  constructor(
    @Inject(AgenteService) private readonly agente: AgenteService,
    @Inject(ReportesService) private readonly reportes: ReportesService,
    @Inject(AUDITORIA_PORT) private readonly auditoria: AuditoriaPort,
  ) {}

  /** Consulta en lenguaje natural. El agente solo usa herramientas de lectura permitidas por tu rol. */
  @Post('agente/consulta')
  @Roles(...ROLES_GESTION)
  consulta(@Body() dto: ConsultaAgenteDto, @Req() req: { headers: { authorization?: string } }, @CurrentUser() user?: AuthUser) {
    return traducir(this.agente.consultar(dto.texto, identidadDeReq(req, user)));
  }

  /** Registro de las llamadas a herramientas (solo administrador). */
  @Get('agente/auditoria')
  @Roles('administrador')
  verAuditoria(@Query() q: AuditoriaQuery) {
    return { registros: this.auditoria.recientes(q.limite ?? 50) };
  }

  /**
   * Ejecuta una ESPECIFICACION de reporte (JSON validado con zod; nunca codigo ni SQL). `?formato=json|xlsx|csv|pdf`.
   */
  @Post('reportes')
  @Roles(...ROLES_GESTION)
  async reporte(
    @Body() spec: unknown,
    @Query('formato') formato: string | undefined,
    @Req() req: { headers: { authorization?: string } },
    @CurrentUser() user?: AuthUser,
  ) {
    const f = (formato ?? 'json').toLowerCase();
    if (!['json', 'xlsx', 'csv', 'pdf'].includes(f)) return traducir(Promise.reject(new ConsultaInvalidaError('formato debe ser json, xlsx, csv o pdf')));
    const r = await traducir(this.reportes.ejecutar(spec, identidadDeReq(req, user)));
    if (f === 'json') return r;
    const nombre = r.titulo.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'reporte';
    const cuerpo = f === 'xlsx' ? await aXlsx(r) : f === 'pdf' ? await aPdf(r) : Buffer.from(aCsv(r), 'utf-8');
    return new StreamableFile(cuerpo, { type: TIPOS[f as keyof typeof TIPOS], disposition: `attachment; filename="${nombre}.${f}"` });
  }
}
