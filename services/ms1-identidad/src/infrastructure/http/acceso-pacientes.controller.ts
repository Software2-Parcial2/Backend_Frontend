import { Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { ProblemException } from '@sigec/http-nest';
import { AccesoPacientesService } from '../../application/acceso-pacientes.service.js';
import { traducir } from './errores.js';

/**
 * Acceso de un paciente al portal (PWA y app movil). Lo usa recepcion al registrar al paciente: la cuenta solo puede tener el rol
 * `paciente` y el nombre y el correo salen de la ficha de MS2 (leida con el token de quien llama).
 */
@ApiTags('identidad')
@ApiBearerAuth()
@Roles('administrador', 'recepcion')
@Controller('api/identidad/pacientes/:pacienteId/acceso')
export class AccesoPacientesController {
  constructor(private readonly acceso: AccesoPacientesService) {}

  /** `SIN_CUENTA`, `INVITACION_PENDIENTE` (aun no definio su contrasena), `ACTIVA` o `DESHABILITADA`. */
  @Get()
  estado(@Param('pacienteId') pacienteId: string) {
    return traducir(this.acceso.estado(pacienteId));
  }

  /**
   * Crea la cuenta si no existe y envia el correo "Activa tu cuenta" (vence en 72 h). Repetirlo reenvia la invitacion.
   * `422 SIN_CORREO` si la ficha no tiene correo; `409 CUENTA_YA_ACTIVA` si el paciente ya definio su contrasena.
   * Si la cuenta se crea pero el correo no sale (Keycloak sin SMTP) responde 201 con `enviada: false` y el motivo.
   */
  @Post()
  @HttpCode(201)
  invitar(@Param('pacienteId') pacienteId: string, @Headers('authorization') autorizacion?: string, @CurrentUser() user?: AuthUser) {
    if (!user?.sub || !autorizacion) throw new ProblemException(401, 'NO_AUTENTICADO', 'No autenticado', 'Falta la identidad de quien invita');
    return traducir(this.acceso.invitar({ sub: user.sub, username: user.username ?? user.sub }, pacienteId, autorizacion));
  }
}
