import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { AgendaService } from '../../application/horarios/agenda.service.js';
import { type FiltroCitas } from '../../application/saga/cita-repository.js';
import { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import { SolicitudInvalidaError, type CitaEstado } from '../../domain/cita.js';
import { traducir } from './errores.js';
import { toView } from './cita.view.js';
import { ResumenDto } from './dto/agenda.dto.js';
import { BuscarCitasDto } from './dto/buscar-citas.dto.js';
import { AsistenciaDto, CancelarCitaDto, ReprogramarCitaDto } from './dto/ciclo-vida.dto.js';
import { DisponibilidadDto } from './dto/disponibilidad.dto.js';
import { SolicitarCitaDto } from './dto/solicitar-cita.dto.js';

const STAFF = ['administrador', 'recepcion', 'medico'];
/** Un paciente (y solo un paciente, sin rol de personal) esta restringido a sus propias citas. */
const esSoloPaciente = (u?: AuthUser) => !!u && u.roles.includes('paciente') && !u.roles.some((r) => STAFF.includes(r));
const actor = (u?: AuthUser) => u?.username ?? u?.sub ?? 'desconocido';

@ApiTags('citas')
@ApiBearerAuth()
@Controller('api/citas')
export class CitasController {
  constructor(
    private readonly saga: CitaSagaService,
    private readonly agenda: AgendaService,
  ) {}

  /**
   * Listado por indices (sin Scan), mas recientes primero, con cursor: `?limite=20&cursor=...`.
   * Filtros: `pacienteId`, o `medicoId` + `desde`/`hasta` (agenda del medico), y `estado`. Un paciente solo ve las suyas.
   */
  @Get()
  async listar(@Query() q: BuscarCitasDto, @CurrentUser() user?: AuthUser) {
    const filtro: FiltroCitas = {
      pacienteId: q.pacienteId,
      medicoId: q.medicoId,
      desde: q.desde ? Date.parse(q.desde) : undefined,
      hasta: q.hasta ? Date.parse(q.hasta) : undefined,
      estado: q.estado as CitaEstado | undefined,
    };
    if (esSoloPaciente(user)) {
      if (!user?.pacienteId) throw new ForbiddenException('El usuario no esta vinculado a un paciente');
      if (q.pacienteId && q.pacienteId !== user.pacienteId) throw new ForbiddenException('Solo puedes consultar tus propias citas');
      if (q.medicoId) throw new ForbiddenException('Solo puedes consultar tus propias citas');
      filtro.pacienteId = user.pacienteId;
    }
    try {
      const pagina = await this.saga.buscar(filtro, q.limite ?? 20, q.cursor);
      return { items: pagina.items.map(toView), siguiente: pagina.siguiente };
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Horarios de un medico en un rango, en orden cronologico y con cursor. Sin datos de pacientes (solo si el horario esta
   * libre, reservado, ocupado o bloqueado), asi que lo puede consultar cualquier usuario autenticado. Debe ir antes de `:id`.
   */
  @Get('disponibilidad')
  async disponibilidad(@Query() q: DisponibilidadDto) {
    const desde = new Date(q.desde);
    const hasta = new Date(q.hasta);
    if (hasta.getTime() < desde.getTime()) traducir(new SolicitudInvalidaError('hasta debe ser posterior a desde'));
    try {
      const pagina = await this.saga.disponibilidad({ medicoId: q.medicoId, desde: desde.toISOString(), hasta: hasta.toISOString(), soloLibres: q.soloLibres }, q.limite ?? 50, q.cursor);
      return {
        items: pagina.items.map((h) => ({ fechaHora: h.fechaHora, estado: h.estado === 'CONFIRMADO' ? 'OCUPADO' : h.estado })),
        siguiente: pagina.siguiente,
      };
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Conteo agregado de citas por especialidad, medico, estado o mes (por la fecha de la cita). Lo usa MS7 en lugar de paginar todas
   * las citas. Va antes de `:id`.
   */
  @Get('resumen')
  @Roles('administrador', 'recepcion', 'caja')
  async resumen(@Query() q: ResumenDto) {
    if (Date.parse(q.hasta) < Date.parse(q.desde)) traducir(new SolicitudInvalidaError('hasta debe ser posterior a desde'));
    return this.agenda.resumen(new Date(q.desde).toISOString(), new Date(q.hasta).toISOString(), q.agruparPor ?? 'especialidad');
  }

  @Get(':id')
  async obtener(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return toView(await this.propia(id, user));
  }

  /** Estados, pasos de la SAGA (reserva, cobro, aviso) y compensacion de la cita. */
  @Get(':id/historial')
  async historial(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    const cita = await this.propia(id, user);
    try {
      return await this.agenda.historial(id, cita);
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Inicia la SAGA: reserva el horario (409 HORARIO_OCUPADO si esta ocupado) y responde 202; el cobro y la notificacion continuan de
   * forma asincrona (consultar GET /api/citas/{id}).
   */
  @Post()
  @HttpCode(202)
  @Roles('recepcion', 'paciente', 'administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async crear(@Body() dto: SolicitarCitaDto, @CurrentUser() user?: AuthUser) {
    if (esSoloPaciente(user) && dto.pacienteId !== user?.pacienteId) {
      throw new ForbiddenException('Un paciente solo puede pedir citas para si mismo');
    }
    try {
      const { citaId, sagaId } = await this.saga.solicitar(dto);
      return { citaId, sagaId, estado: 'RESERVADA', seguimiento: `/api/citas/${citaId}` };
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Cancela una cita CONFIRMADA: anula el cobro provisional, libera el horario y avisa al paciente (cita.cancelada).
   * 409 CITA_EN_PROCESO si la SAGA aun no termino, CITA_YA_CANCELADA o CITA_NO_MODIFICABLE; 422 CITA_PASADA.
   */
  @Post(':id/cancelar')
  @HttpCode(200)
  @Roles('recepcion', 'paciente', 'administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async cancelar(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelarCitaDto, @CurrentUser() user?: AuthUser) {
    await this.propia(id, user);
    try {
      return toView(await this.saga.cancelar(id, dto.motivo, actor(user)));
    } catch (e) {
      return traducir(e);
    }
  }

  /**
   * Mueve una cita CONFIRMADA a otra fecha y hora. El horario nuevo se toma y el viejo se libera en una sola transaccion
   * (409 HORARIO_OCUPADO sin cambiar nada). El cargo se conserva.
   */
  @Post(':id/reprogramar')
  @HttpCode(200)
  @Roles('recepcion', 'paciente', 'administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async reprogramar(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReprogramarCitaDto, @CurrentUser() user?: AuthUser) {
    await this.propia(id, user);
    try {
      return toView(await this.saga.reprogramarCita(id, dto.fechaHora, actor(user)));
    } catch (e) {
      return traducir(e);
    }
  }

  /** Registra la llegada del paciente, la atencion o la inasistencia (publica cita.asistencia-registrada). */
  @Post(':id/asistencia')
  @HttpCode(200)
  @Roles('recepcion', 'medico', 'administrador')
  @Idempotent()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID; ver contracts/idempotency.md' })
  async asistencia(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AsistenciaDto, @CurrentUser() user?: AuthUser) {
    try {
      return toView(await this.saga.registrarAsistencia(id, dto.accion, actor(user)));
    } catch (e) {
      return traducir(e);
    }
  }

  /** Para un paciente, la cita ajena es indistinguible de una inexistente (404, no 403: no revela que existe). */
  private async propia(id: string, user?: AuthUser) {
    const cita = await this.saga.obtener(id);
    if (!cita || (esSoloPaciente(user) && cita.input.pacienteId !== user?.pacienteId)) throw new NotFoundException(`No existe la cita ${id}`);
    return cita;
  }
}
