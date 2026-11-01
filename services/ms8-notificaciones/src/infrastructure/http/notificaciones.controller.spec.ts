import { BadRequestException, ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@sigec/auth-nest';
import type { NotificacionesService } from '../../application/notificaciones.service.js';
import { PreferenciasInvalidasError } from '../../domain/notificacion.js';
import { InternalSecretGuard } from './internal-secret.guard.js';
import { NotificacionesController } from './notificaciones.controller.js';

const MIO = 'a0000000-0000-4000-8000-000000000001';
const OTRO = 'b0000000-0000-4000-8000-000000000002';
const paciente: AuthUser = { sub: 'u', roles: ['paciente'], pacienteId: MIO };
const recepcion: AuthUser = { sub: 'r', roles: ['recepcion'] };
const medico: AuthUser = { sub: 'm', roles: ['medico'] };

function setup() {
  const llamadas: string[] = [];
  const service = {
    obtenerPreferencias: async (id: string) => (llamadas.push(`get:${id}`), { pacienteId: id, canales: ['EMAIL'] }),
    guardarPreferencias: async (id: string, c: string[]) => {
      llamadas.push(`put:${id}`);
      if (c.includes('SMS')) throw new PreferenciasInvalidasError('canales invalidos');
      return { pacienteId: id, canales: c };
    },
    generarCodigoVinculo: async (id: string, codigo: string) => (llamadas.push(`vinculo:${id}`), { codigo, expiraEn: new Date().toISOString() }),
  } as unknown as NotificacionesService;
  return { controller: new NotificacionesController(service), llamadas };
}

describe('NotificacionesController - autorizacion', () => {
  it('un paciente gestiona SOLO sus preferencias', async () => {
    const { controller, llamadas } = setup();
    await expect(controller.preferencias(MIO, paciente)).resolves.toMatchObject({ pacienteId: MIO });
    await expect(controller.preferencias(OTRO, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.guardarPreferencias(OTRO, { canales: ['EMAIL'] }, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    expect(llamadas).toEqual(['get:' + MIO]); // lo ajeno ni siquiera llega al servicio
  });

  it('recepcion gestiona a cualquiera; un medico no gestiona preferencias', async () => {
    const { controller } = setup();
    await expect(controller.guardarPreferencias(OTRO, { canales: ['EMAIL', 'TELEGRAM'] }, recepcion)).resolves.toMatchObject({ canales: ['EMAIL', 'TELEGRAM'] });
    await expect(controller.preferencias(OTRO, medico)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('canales invalidos -> 400', async () => {
    const { controller } = setup();
    await expect(controller.guardarPreferencias(MIO, { canales: ['SMS'] }, paciente)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el codigo de vinculo: el paciente lo genera para si; no puede pedirlo para otro; recepcion si', async () => {
    const { controller, llamadas } = setup();
    const r = await controller.vinculo({}, paciente);
    expect(r.codigo).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(r.instruccion).toContain(`/start ${r.codigo}`);
    await expect(controller.vinculo({ pacienteId: OTRO }, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.vinculo({ pacienteId: OTRO }, recepcion)).resolves.toBeDefined();
    await expect(controller.vinculo({}, recepcion)).rejects.toBeInstanceOf(BadRequestException); // el personal debe indicar el paciente
    expect(llamadas).toEqual([`vinculo:${MIO}`, `vinculo:${OTRO}`]);
  });
});

describe('InternalSecretGuard', () => {
  const ctx = (secret?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: secret === undefined ? {} : { 'x-sigec-secret': secret } }) }) }) as unknown as ExecutionContext;
  const guard = new InternalSecretGuard();
  const previo = process.env.MS8_INTERNAL_SECRET;
  afterEach(() => {
    if (previo === undefined) delete process.env.MS8_INTERNAL_SECRET;
    else process.env.MS8_INTERNAL_SECRET = previo;
  });

  it('acepta el secreto correcto y rechaza el incorrecto o ausente', () => {
    process.env.MS8_INTERNAL_SECRET = 'secreto-largo-de-prueba';
    expect(guard.canActivate(ctx('secreto-largo-de-prueba'))).toBe(true);
    expect(() => guard.canActivate(ctx('otro'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('falla cerrado: sin secreto configurado rechaza todo, incluso una cabecera vacia', () => {
    delete process.env.MS8_INTERNAL_SECRET;
    expect(() => guard.canActivate(ctx(''))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx('cualquiera'))).toThrow(UnauthorizedException);
  });
});
