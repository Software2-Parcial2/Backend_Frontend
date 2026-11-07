import { randomInt } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Param, Patch, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { ProblemException } from '@sigec/http-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { NotificacionesService } from '../../application/notificaciones.service.js';
import { PreferenciasInvalidasError, ReglaNotificacionError, type Notificacion, type NotificacionTipo } from '../../domain/notificacion.js';
import { CursorInvalidoError } from '../persistence/dynamo-notificaciones.repositories.js';
import { CanalQueryDto, LeidasDto, ListarNotificacionesDto, PlantillaDto, PreferenciasDto, PreferenciasPersonalDto, ResumenDto, VinculoDto, VistaPreviaDto } from './dto.js';

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L: el paciente lo teclea en el movil
const codigo = () => Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
const STAFF = ['administrador', 'recepcion'];
const TIPOS_RUTA = new Set(['CITA_CONFIRMADA', 'CITA_CANCELADA', 'CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO']);

/** El personal gestiona a cualquier paciente; un paciente solo a si mismo (claim paciente_id). */
function autorizar(user: AuthUser | undefined, pacienteId: string) {
  if (user?.roles.some((r) => STAFF.includes(r))) return;
  if (user?.roles.includes('paciente') && user.pacienteId === pacienteId) return;
  throw new ForbiddenException('Solo puedes gestionar tus propias preferencias');
}

const esSoloPaciente = (u?: AuthUser) => !!u && u.roles.includes('paciente') && !u.roles.some((r) => [...STAFF, 'medico', 'caja'].includes(r));

/** Errores de regla -> problem+json con code estable (se traducen en el controlador para que la idempotencia guarde los 4xx). */
function traducir(e: unknown): never {
  if (e instanceof ReglaNotificacionError) {
    const titulo = e.status === 404 ? 'No encontrado' : e.status === 409 ? 'Conflicto' : 'Regla de negocio incumplida';
    throw new ProblemException(e.status, e.code, titulo, e.message, e.extras);
  }
  if (e instanceof PreferenciasInvalidasError) throw new BadRequestException(e.message);
  if (e instanceof CursorInvalidoError) throw new ProblemException(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
  throw e;
}

function version(ifMatch: string | undefined): number {
  if (!ifMatch?.trim()) throw new ProblemException(400, 'IF_MATCH_REQUERIDO', 'Solicitud invalida', 'Falta la cabecera If-Match con la version que esta editando (0 = la de fabrica)');
  const n = Number(ifMatch.trim().replace(/"/g, '').replace('W/', ''));
  if (!Number.isInteger(n) || n < 0) throw new ProblemException(400, 'IF_MATCH_INVALIDO', 'Solicitud invalida', 'If-Match debe ser la version numerica');
  return n;
}

function tipoRuta(tipo: string): NotificacionTipo {
  if (!TIPOS_RUTA.has(tipo)) throw new ProblemException(422, 'TIPO_INVALIDO', 'Regla de negocio incumplida', `tipo debe ser uno de: ${[...TIPOS_RUTA].join(', ')}`);
  return tipo as NotificacionTipo;
}

/** Vista publica de una notificacion (sin version interna ni reintentos). */
export function toView(n: Notificacion) {
  return {
    id: n.id,
    citaId: n.citaId,
    pacienteId: n.pacienteId,
    tipo: n.tipo,
    estado: n.estado,
    canales: n.canalesEnviados,
    intentos: n.intentos,
    ultimoError: n.ultimoError ?? null,
    fechaHora: n.fechaHora ?? null,
    leida: n.leida ?? false,
    leidaEn: n.leidaEn ?? null,
    creadaEn: n.creadaEn,
    actualizadaEn: n.actualizadaEn,
  };
}

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  /**
   * Historial: `?pacienteId&estado&tipo&canal&desde&limite&cursor` (mas recientes primero) o `?citaId`. El personal indica
   * `pacienteId` o `citaId`; un paciente ve solo las suyas.
   */
  @Get()
  @Roles('administrador', 'recepcion', 'medico', 'paciente')
  async listar(@Query() q: ListarNotificacionesDto, @CurrentUser() user?: AuthUser) {
    const propio = esSoloPaciente(user);
    if (propio && !user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
    if (propio && q.pacienteId && q.pacienteId !== user?.pacienteId) throw new ForbiddenException('Solo puedes consultar tus propias notificaciones');
    const pacienteId = propio ? user!.pacienteId! : q.pacienteId;
    try {
      if (q.citaId) {
        const todas = (await this.service.porCita(q.citaId)).filter((n) => !pacienteId || n.pacienteId === pacienteId);
        return { items: todas.map(toView), siguiente: null };
      }
      if (!pacienteId) throw new BadRequestException('Indica pacienteId o citaId');
      const p = await this.service.historial({ pacienteId, estado: q.estado, tipo: q.tipo as NotificacionTipo | undefined, canal: q.canal, desde: q.desde ? Date.parse(q.desde) : undefined }, q.limite ?? 25, q.cursor);
      return { items: p.items.map(toView), siguiente: p.siguiente };
    } catch (e) {
      return traducir(e);
    }
  }

  /** KPIs del dia (hora de la clinica): enviadas, pendientes, fallidas, tasa de entrega y desglose por tipo y canal. */
  @Get('resumen')
  @Roles('administrador', 'recepcion')
  async resumen(@Query() q: ResumenDto) {
    try {
      return await this.service.resumen(q.fecha);
    } catch (e) {
      return traducir(e);
    }
  }

  /** El paciente marca como leidas varias de sus notificaciones. */
  @Post('leidas')
  @HttpCode(200)
  @Roles('paciente')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async leidas(@Body() dto: LeidasDto, @CurrentUser() user?: AuthUser) {
    if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
    return this.service.marcarLeidas(dto.ids, user.pacienteId);
  }

  @Patch(':id/leida')
  @HttpCode(200)
  @Roles('paciente')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async leida(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
    const { marcadas } = await this.service.marcarLeidas([id], user.pacienteId);
    if (!marcadas) throw new ProblemException(404, 'NOTIFICACION_NO_ENCONTRADA', 'No encontrado', `No existe la notificacion ${id}`);
    return { id, leida: true };
  }

  /** Reenvia una notificacion FALLIDA. Solo las fallidas (409 `NOTIFICACION_NO_REENVIABLE`). */
  @Post(':id/reenviar')
  @HttpCode(200)
  @Roles('administrador', 'recepcion')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async reenviar(@Param('id', new ParseUUIDPipe()) id: string) {
    try {
      return toView(await this.service.reenviar(id));
    } catch (e) {
      return traducir(e);
    }
  }

  // --- plantillas -----------------------------------------------------------------------------------------

  /** Plantillas vigentes (version 0 = de fabrica) de cada aviso y canal. */
  @Get('plantillas')
  @Roles('administrador', 'recepcion', 'medico')
  async plantillas() {
    return { items: await this.service.listarPlantillas() };
  }

  @Get('plantillas/:tipo')
  @Roles('administrador', 'recepcion', 'medico')
  async plantilla(@Param('tipo') tipo: string, @Query() q: CanalQueryDto) {
    try {
      return await this.service.plantilla(tipoRuta(tipo), q.canal ?? 'EMAIL');
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Guarda una version nueva (`If-Match` = version que se esta editando; 0 si aun es la de fabrica). Variables permitidas:
   * `{{nombre}}`, `{{fecha}}`, `{{hora}}`, `{{cuando}}`. Se rechaza el contenido clinico.
   */
  @Put('plantillas/:tipo')
  @Roles('administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true, description: 'Version vigente que se esta editando' })
  async guardarPlantilla(@Param('tipo') tipo: string, @Body() dto: PlantillaDto, @Headers('if-match') ifMatch: string | undefined, @CurrentUser() user?: AuthUser) {
    try {
      return await this.service.guardarPlantilla(tipoRuta(tipo), dto.canal, dto.asunto, dto.cuerpo, version(ifMatch), user?.sub ?? 'desconocido');
    } catch (e) {
      return traducir(e);
    }
  }

  /** Renderiza una propuesta con datos de ejemplo sin guardarla. */
  @Post('plantillas/:tipo/vista-previa')
  @HttpCode(200)
  @Roles('administrador')
  async vistaPrevia(@Param('tipo') tipo: string, @Body() dto: VistaPreviaDto) {
    try {
      return this.service.vistaPrevia(tipoRuta(tipo), dto.canal, dto.asunto, dto.cuerpo, { nombre: dto.nombre, fechaHora: dto.fechaHora });
    } catch (e) {
      return traducir(e);
    }
  }

  // --- preferencias ---------------------------------------------------------------------------------------

  /** Alertas internas que recibe el usuario del personal autenticado. */
  @Get('preferencias/personal/me')
  @Roles('administrador', 'recepcion', 'medico', 'caja')
  preferenciasPersonal(@CurrentUser() user?: AuthUser) {
    return this.service.obtenerPreferenciasPersonal(user?.sub ?? 'desconocido');
  }

  @Put('preferencias/personal/me')
  @Roles('administrador', 'recepcion', 'medico', 'caja')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  guardarPreferenciasPersonal(@Body() dto: PreferenciasPersonalDto, @CurrentUser() user?: AuthUser) {
    return this.service.guardarPreferenciasPersonal(user?.sub ?? 'desconocido', dto.alertas);
  }

  @Get('preferencias/:pacienteId')
  async preferencias(@Param('pacienteId', new ParseUUIDPipe()) pacienteId: string, @CurrentUser() user?: AuthUser) {
    autorizar(user, pacienteId);
    const c = await this.service.obtenerPreferencias(pacienteId);
    return vistaPreferencias(c);
  }

  @Put('preferencias/:pacienteId')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async guardarPreferencias(@Param('pacienteId', new ParseUUIDPipe()) pacienteId: string, @Body() dto: PreferenciasDto, @CurrentUser() user?: AuthUser) {
    autorizar(user, pacienteId);
    try {
      return vistaPreferencias(await this.service.guardarPreferencias(pacienteId, dto.canales, { tiposAviso: dto.tiposAviso, antelacionHoras: dto.antelacionHoras }));
    } catch (e) {
      return traducir(e);
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

  /** Desvincula Telegram (el paciente, o el personal indicando `?pacienteId`). Si era su unico canal vuelve a EMAIL. */
  @Delete('telegram/vinculo')
  @Roles('administrador', 'recepcion', 'paciente')
  async desvincular(@Query('pacienteId', new ParseUUIDPipe({ optional: true })) pacienteId: string | undefined, @CurrentUser() user?: AuthUser) {
    const id = pacienteId ?? user?.pacienteId;
    if (!id) throw new BadRequestException('Indica pacienteId (el usuario no esta vinculado a un paciente)');
    autorizar(user, id);
    try {
      return vistaPreferencias(await this.service.desvincularTelegram(id));
    } catch (e) {
      return traducir(e);
    }
  }
}

function vistaPreferencias(c: { pacienteId: string; canales: string[]; email?: string | null; telegramChatId?: string; tiposAviso?: string[]; antelacionHoras?: number }) {
  return {
    pacienteId: c.pacienteId,
    canales: c.canales,
    email: c.email ?? null,
    telegramVinculado: !!c.telegramChatId,
    tiposAviso: c.tiposAviso ?? ['CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO'],
    antelacionHoras: c.antelacionHoras ?? 24,
  };
}
