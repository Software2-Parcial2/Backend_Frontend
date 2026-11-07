import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import { ProblemException } from '@sigec/http-nest';
import { type Actor, UsuariosService } from '../../application/usuarios.service.js';
import { ActualizarUsuarioDto, AuditoriaDto, CrearUsuarioDto, ListarEventosDto, ListarUsuariosDto, PaginaDto, RolesDto } from './dto.js';
import { traducir } from './errores.js';

function actorDe(user: AuthUser | undefined): Actor {
  if (!user?.sub) throw new ProblemException(401, 'NO_AUTENTICADO', 'No autenticado', 'Falta la identidad del administrador');
  return { sub: user.sub, username: user.username ?? user.sub };
}

/**
 * Administracion de identidad (solo `administrador`). Las operaciones son idempotentes por diseno (estado absoluto), salvo crear:
 * repetirla da `409 USUARIO_DUPLICADO`. Por eso aqui no se exige `Idempotency-Key` (este servicio no guarda estado propio).
 */
@ApiTags('identidad')
@ApiBearerAuth()
@Roles('administrador')
@Controller('api/identidad')
export class IdentidadController {
  constructor(private readonly usuarios: UsuariosService) {}

  /** Usuarios: `?q&rol&activo&limite&cursor`. */
  @Get('usuarios')
  listar(@Query() q: ListarUsuariosDto) {
    return traducir(this.usuarios.listar({ q: q.q, rol: q.rol, activo: q.activo }, q.limite ?? 25, q.cursor));
  }

  @Get('usuarios/:id')
  obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return traducir(this.usuarios.obtener(id));
  }

  /**
   * Crea un usuario con sus roles. `paciente` exige `pacienteId` y no admite otros roles. Con `passwordTemporal` el usuario la
   * cambia al entrar; sin ella recibe un correo para definirla.
   */
  @Post('usuarios')
  @HttpCode(201)
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.crear(actorDe(user), dto));
  }

  @Put('usuarios/:id')
  actualizar(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ActualizarUsuarioDto, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.actualizar(actorDe(user), id, dto));
  }

  /** `409 AUTOPROTECCION` si es tu propia cuenta; `409 ULTIMO_ADMINISTRADOR` si dejaria al sistema sin administrador. Cierra sus sesiones. */
  @Post('usuarios/:id/deshabilitar')
  @HttpCode(200)
  deshabilitar(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.habilitar(actorDe(user), id, false));
  }

  @Post('usuarios/:id/habilitar')
  @HttpCode(200)
  habilitar(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.habilitar(actorDe(user), id, true));
  }

  /** Reemplaza los roles (y limpia los vinculos que ya no corresponden). Cierra las sesiones del usuario para que el cambio se aplique al volver a entrar. */
  @Put('usuarios/:id/roles')
  roles(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RolesDto, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.cambiarRoles(actorDe(user), id, dto.roles, { pacienteId: dto.pacienteId, medicoId: dto.medicoId, especialidad: dto.especialidad, matricula: dto.matricula }));
  }

  /** Envia al usuario un correo para definir una contrasena nueva. */
  @Post('usuarios/:id/recuperar')
  @HttpCode(200)
  recuperar(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    return traducir(this.usuarios.recuperar(actorDe(user), id));
  }

  @Get('usuarios/:id/sesiones')
  async sesionesDeUsuario(@Param('id', new ParseUUIDPipe()) id: string) {
    return { items: await traducir(this.usuarios.sesionesDeUsuario(id)), siguiente: null };
  }

  @Post('usuarios/:id/revocar-sesiones')
  @HttpCode(204)
  async revocar(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    await traducir(this.usuarios.revocarSesiones(actorDe(user), id));
  }

  /** Sesiones activas del reino (mas recientes primero). */
  @Get('sesiones')
  sesiones(@Query() q: PaginaDto) {
    return traducir(this.usuarios.sesiones(q.limite ?? 25, q.cursor));
  }

  @Delete('sesiones/:id')
  @HttpCode(204)
  async cerrarSesion(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser) {
    await traducir(this.usuarios.cerrarSesion(actorDe(user), id));
  }

  /** Eventos de autenticacion de Keycloak: `?tipo&usuarioId&desde&hasta&limite&cursor`. */
  @Get('eventos')
  eventos(@Query() q: ListarEventosDto) {
    return traducir(this.usuarios.eventos({ tipo: q.tipo, usuarioId: q.usuarioId, desde: q.desde, hasta: q.hasta }, q.limite ?? 25, q.cursor));
  }

  /** Cambios hechos por este servicio (quien, cuando, a quien): anillo en memoria de los ultimos 500. */
  @Get('auditoria')
  auditoria(@Query() q: AuditoriaDto) {
    return { items: this.usuarios.auditoriaReciente(q.limite ?? 50) };
  }
}
