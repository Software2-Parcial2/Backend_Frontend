import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { CursorInvalidoError, type FiltroCitas } from '../../application/saga/cita-repository.js';
import { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import { HorarioNoDisponibleError, SolicitudInvalidaError } from '../../domain/cita.js';
import { toView } from './cita.view.js';
import { BuscarCitasDto } from './dto/buscar-citas.dto.js';
import { DisponibilidadDto } from './dto/disponibilidad.dto.js';
import { SolicitarCitaDto } from './dto/solicitar-cita.dto.js';

const STAFF = ['administrador', 'recepcion', 'medico'];
/** Un paciente (y solo un paciente, sin rol de personal) esta restringido a sus propias citas. */
const esSoloPaciente = (u?: AuthUser) => !!u && u.roles.includes('paciente') && !u.roles.some((r) => STAFF.includes(r));

@ApiTags('citas')
@ApiBearerAuth()
@Controller('api/citas')
export class CitasController {
  constructor(private readonly saga: CitaSagaService) {}

  /**
   * Listado por indices (sin Scan), mas recientes primero, con cursor: `?limite=20&cursor=...`.
   * Filtros: `pacienteId`, o `medicoId` + `desde`/`hasta` (agenda del medico). Un paciente solo ve las suyas.
   */
  @Get()
  async listar(@Query() q: BuscarCitasDto, @CurrentUser() user?: AuthUser) {
    const filtro: FiltroCitas = {
      pacienteId: q.pacienteId,
      medicoId: q.medicoId,
      desde: q.desde ? Date.parse(q.desde) : undefined,
      hasta: q.hasta ? Date.parse(q.hasta) : undefined,
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
      if (e instanceof CursorInvalidoError) throw new BadRequestException('cursor invalido');
      throw e;
    }
  }

  /**
   * Horarios de un medico en un rango, en orden cronologico y con cursor. Sin datos de pacientes (solo si el horario esta
   * libre, reservado u ocupado), asi que lo puede consultar cualquier usuario autenticado. Debe ir antes de `:id`.
   */
  @Get('disponibilidad')
  async disponibilidad(@Query() q: DisponibilidadDto) {
    const desde = new Date(q.desde);
    const hasta = new Date(q.hasta);
    if (hasta.getTime() < desde.getTime()) throw new BadRequestException('hasta debe ser posterior a desde');
    try {
      const pagina = await this.saga.disponibilidad({ medicoId: q.medicoId, desde: desde.toISOString(), hasta: hasta.toISOString(), soloLibres: q.soloLibres }, q.limite ?? 50, q.cursor);
      return {
        items: pagina.items.map((h) => ({ fechaHora: h.fechaHora, estado: h.estado === 'CONFIRMADO' ? 'OCUPADO' : h.estado })),
        siguiente: pagina.siguiente,
      };
    } catch (e) {
      if (e instanceof CursorInvalidoError) throw new BadRequestException('cursor invalido');
      throw e;
    }
  }

  @Get(':id')
  async obtener(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    const cita = await this.saga.obtener(id);
    // Para un paciente, la cita ajena es indistinguible de una inexistente (404, no 403: no revela que existe).
    if (!cita || (esSoloPaciente(user) && cita.input.pacienteId !== user?.pacienteId)) throw new NotFoundException(`No existe la cita ${id}`);
    return toView(cita);
  }

  /**
   * Inicia la SAGA: reserva el horario (409 si esta ocupado) y responde 202; el cobro y la notificacion continuan de forma
   * asincrona (consultar GET /api/citas/{id}).
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
      // Se traducen a HttpException para que la idempotencia guarde la respuesta (4xx deterministas).
      if (e instanceof HorarioNoDisponibleError) throw new ConflictException(e.message);
      if (e instanceof SolicitudInvalidaError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
