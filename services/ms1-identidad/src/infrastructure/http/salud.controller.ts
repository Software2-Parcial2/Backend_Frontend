import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '@sigec/auth-nest';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SaludService } from '../../application/salud.service.js';

@ApiTags('salud')
@ApiBearerAuth()
@Controller()
export class SaludController {
  constructor(
    private readonly salud: SaludService,
    private readonly health: HealthCheckService,
  ) {}

  /** Estado de cada servicio de la pila (consulta su /health con un plazo corto). Siempre 200: el estado va en el cuerpo. */
  @Get('api/salud')
  @Roles('administrador')
  estado() {
    return this.salud.estado();
  }

  /** Salud de este servicio (para el propio agregado y para Docker). Sin autenticacion. */
  @Public()
  @Get('health')
  @HealthCheck()
  propia() {
    return this.health.check([]);
  }
}
