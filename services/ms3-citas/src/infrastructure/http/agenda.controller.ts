import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { AgendaService } from '../../application/horarios/agenda.service.js';
import { traducir } from './errores.js';
import { AgendaDto, MiAgendaDto } from './dto/agenda.dto.js';

/** Agenda de un dia: una columna por medico con sus celdas (LIBRE, RESERVA_TEMPORAL, CONFIRMADA, EN_SALA, ATENDIDA, NO_ASISTIO, BLOQUEADO). */
@ApiTags('agenda')
@ApiBearerAuth()
@Controller('api/citas/agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  /** Agenda general de la clinica (recepcion y administracion). Filtros: `especialidad` (codigo) y `consultorio`. */
  @Get()
  @Roles('administrador', 'recepcion', 'medico')
  async dia(@Query() q: AgendaDto) {
    try {
      return await this.agenda.agendaDelDia(q.fecha, { especialidad: q.especialidad, consultorio: q.consultorio });
    } catch (e) {
      return traducir(e);
    }
  }

  /** Mi agenda: el medico autenticado (por el claim `medico_id` o, si no lo trae, por su usuario), con el resumen del dia. */
  @Get('medico/me')
  @Roles('medico')
  async mia(@Query() q: MiAgendaDto, @CurrentUser() user?: AuthUser) {
    try {
      return await this.agenda.miAgenda({ medicoId: user?.medicoId, username: user?.username }, q.fecha);
    } catch (e) {
      return traducir(e);
    }
  }
}
