import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@sigec/auth-nest';
import { randomUUID } from 'node:crypto';
import type { ImagenesService } from '../../application/imagenes.service.js';
import { ArchivoInvalidoError, PacienteInexistenteError, ReglaImagenError, type Imagen } from '../../domain/imagen.js';
import { ImagenesController, toView } from './imagenes.controller.js';

const MIO = 'a0000000-0000-4000-8000-000000000001';
const OTRO = 'b0000000-0000-4000-8000-000000000002';
const img = (pacienteId: string): Imagen => ({ id: randomUUID(), pacienteId, estudio: 'x', estado: 'ANALIZADA', hashSha256: 'a'.repeat(64), mime: 'image/jpeg', bytes: 10, bucket: 'secreto-bucket', objectKey: 'radiografias/clave/secreta.jpg', usuarioId: 'u', origen: 'MEDICO', validacion: 'VALIDADO', intentosAnalisis: 1, creadaEn: 1, actualizadaEn: 1 });
const paciente: AuthUser = { sub: 'p', roles: ['paciente'], pacienteId: MIO };
const medico: AuthUser = { sub: 'm', roles: ['medico'] };

function setup(imagenes: Imagen[] = [img(MIO)], subir?: () => Promise<Imagen>) {
  const calls: Record<string, unknown>[] = [];
  const subidos: Record<string, unknown>[] = [];
  const service = {
    obtener: async (id: string) => imagenes.find((i) => i.id === id) ?? null,
    listar: async (f: { pacienteId?: string }) => (calls.push(f), { items: imagenes.filter((i) => !f.pacienteId || i.pacienteId === f.pacienteId), siguiente: null }),
    urlTemporal: async () => ({ url: 'http://s3/firmada', expiraEn: 'x' }),
    subir: subir ?? (async (c: unknown) => (subidos.push(c as Record<string, unknown>), imagenes[0])),
  } as unknown as ImagenesService;
  return { controller: new ImagenesController(service), calls, imagenes, subidos };
}

describe('ImagenesController', () => {
  it('la vista publica NUNCA expone el bucket ni la clave del objeto', () => {
    const v = toView(img(MIO)) as Record<string, unknown>;
    expect(JSON.stringify(v)).not.toMatch(/secreto-bucket|clave\/secreta|objectKey|bucket/);
    expect(v.aviso).toMatch(/no es un diagnostico/i);
  });

  it('un paciente ve sus imagenes; la ajena responde 404 (igual que una inexistente)', async () => {
    const propia = setup([img(MIO)]);
    await expect(propia.controller.obtener(propia.imagenes[0].id, paciente)).resolves.toMatchObject({ pacienteId: MIO });
    await expect(propia.controller.url(propia.imagenes[0].id, paciente)).resolves.toMatchObject({ url: 'http://s3/firmada' });
    const ajena = setup([img(OTRO)]);
    await expect(ajena.controller.obtener(ajena.imagenes[0].id, paciente)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ajena.controller.url(ajena.imagenes[0].id, paciente)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ajena.controller.obtener(randomUUID(), paciente)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el medico y el administrador ven cualquiera', async () => {
    const t = setup([img(OTRO)]);
    await expect(t.controller.obtener(t.imagenes[0].id, medico)).resolves.toMatchObject({ pacienteId: OTRO });
    await expect(t.controller.obtener(t.imagenes[0].id, { sub: 'a', roles: ['administrador'] })).resolves.toBeDefined();
  });

  it('el listado: un paciente queda forzado a sus imagenes ya validadas; el personal puede listar todas', async () => {
    const t = setup([img(MIO), img(OTRO)]);
    await t.controller.listar({}, paciente);
    expect(t.calls).toEqual([{ pacienteId: MIO, validacion: 'VALIDADO' }]);
    await expect(t.controller.listar({ pacienteId: OTRO }, paciente)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.controller.listar({ pacienteId: OTRO, validacion: 'PENDIENTE' }, medico)).resolves.toMatchObject({ items: [{ pacienteId: OTRO }] });
    expect(t.calls.at(-1)).toMatchObject({ pacienteId: OTRO, validacion: 'PENDIENTE' });
    await t.controller.listar({ q: 'rojas' }, medico);
    expect(t.calls.at(-1)).toMatchObject({ q: 'rojas', pacienteId: undefined });
  });

  it('un paciente no ve un estudio sin validar (404) ni el de otro', async () => {
    const t = setup([{ ...img(MIO), validacion: 'PENDIENTE' }]);
    await expect(t.controller.obtener(t.imagenes[0].id, paciente)).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.controller.obtener(t.imagenes[0].id, medico)).resolves.toMatchObject({ validacion: 'PENDIENTE' });
  });

  it('un paciente sube a su nombre (origen PACIENTE); a nombre de otro es 403', async () => {
    const t = setup();
    await expect(t.controller.subir({ buffer: Buffer.from('x') }, { pacienteId: OTRO }, paciente, 't')).rejects.toBeInstanceOf(ForbiddenException);
    await t.controller.subir({ buffer: Buffer.from('x') }, {}, paciente, 't');
    expect(t.subidos.at(-1)).toMatchObject({ pacienteId: MIO, origen: 'PACIENTE' });
    await t.controller.subir({ buffer: Buffer.from('x') }, { pacienteId: OTRO }, medico, 't');
    expect(t.subidos.at(-1)).toMatchObject({ pacienteId: OTRO, origen: 'MEDICO' });
    await expect(t.controller.subir({ buffer: Buffer.from('x') }, {}, medico, 't')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('IMAGEN_DUPLICADA se traduce a 409 problem+json con su code', async () => {
    const dup = setup([img(MIO)], async () => { throw new ReglaImagenError('IMAGEN_DUPLICADA', 409, 'ya subida'); });
    await expect(dup.controller.subir({ buffer: Buffer.from('x') }, { pacienteId: MIO }, medico, 't')).rejects.toMatchObject({ status: 409, response: { code: 'IMAGEN_DUPLICADA' } });
  });

  it('subir: falta el archivo -> 400; errores de dominio -> 400/404 como HttpException (la idempotencia los guarda)', async () => {
    const dto = { pacienteId: MIO };
    await expect(setup().controller.subir(undefined, dto, medico, 't')).rejects.toBeInstanceOf(BadRequestException);
    const invalido = setup([img(MIO)], async () => { throw new ArchivoInvalidoError('tipo no permitido'); });
    await expect(invalido.controller.subir({ buffer: Buffer.from('x') }, dto, medico, 't')).rejects.toBeInstanceOf(BadRequestException);
    const inexistente = setup([img(MIO)], async () => { throw new PacienteInexistenteError(MIO); });
    await expect(inexistente.controller.subir({ buffer: Buffer.from('x') }, dto, medico, 't')).rejects.toBeInstanceOf(NotFoundException);
    expect(ConflictException).toBeDefined();
  });
});
