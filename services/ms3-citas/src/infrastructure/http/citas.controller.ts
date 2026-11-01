import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Roles } from '@sigec/auth-nest';
import { Idempotent } from '@sigec/idempotency-nest';
import { CitaSagaService } from '../../application/saga/cita-saga.service.js';
import { HorarioNoDisponibleError, SolicitudInvalidaError } from '../../domain/cita.js';
import { toView } from './cita.view.js';
import { SolicitarCitaDto } from './dto/solicitar-cita.dto.js';

@ApiTags('citas')
@ApiBearerAuth()
@Controller('api/citas')
export class CitasController {
  constructor(private readonly saga: CitaSagaService) {}

  // TODO: el rol paciente solo debe ver sus propias citas (comparar el claim sub con el paciente).
  @Get()
  async listar() {
    return (await this.saga.listar()).map(toView);
  }

  @Get(':id')
  async obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    const cita = await this.saga.obtener(id);
    if (!cita) throw new NotFoundException(`No existe la cita ${id}`);
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
  async crear(@Body() dto: SolicitarCitaDto) {
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
