import 'reflect-metadata';
import { Body, Controller, Get, HttpException, Module, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CursorDto, ProblemException, aplicarConvenciones, codificarCursor, decodificarCursor, pagina } from '../src/index.js';

class CrearDto {
  @IsString() nombre!: string;
  @IsInt() @Min(1) edad!: number;
}

@Controller('t')
class TController {
  @Post() crear(@Body() dto: CrearDto) { return dto; }
  @Get('negocio') negocio() { throw new ProblemException(409, 'HORARIO_OCUPADO', 'Horario ocupado', 'El horario ya no esta libre'); }
  @Get('nest') nest() { throw new HttpException('Prohibido por regla', 403); }
  @Get('boom') boom() { throw new Error('secreto interno'); }
  @Get('lista') lista(@Query() q: CursorDto) { return pagina([1, 2], { k: q.limite ?? 25 }); }
}

@Module({ controllers: [TController] })
class TModule {}

describe('convenciones HTTP', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  beforeAll(async () => {
    app = await NestFactory.create(TModule, { logger: false });
    aplicarConvenciones(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('validacion -> 400 problem+json con errors por campo', async () => {
    const r = await request(app.getHttpServer()).post('/t').send({ nombre: 3, edad: 0, extra: 1 });
    expect(r.status).toBe(400);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.body).toMatchObject({ status: 400, code: 'VALIDACION', title: 'Solicitud invalida' });
    const campos = (r.body.errors as { campo: string }[]).map((e) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'edad', 'extra']));
  });

  it('ProblemException conserva su code', async () => {
    const r = await request(app.getHttpServer()).get('/t/negocio');
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'HORARIO_OCUPADO', title: 'Horario ocupado', detail: 'El horario ya no esta libre' });
  });

  it('HttpException de Nest recibe code por estado', async () => {
    const r = await request(app.getHttpServer()).get('/t/nest');
    expect(r.body).toMatchObject({ status: 403, code: 'PROHIBIDO', detail: 'Prohibido por regla' });
  });

  it('404 de ruta inexistente tambien es problem+json', async () => {
    const r = await request(app.getHttpServer()).get('/no-existe');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NO_ENCONTRADO');
  });

  it('error no controlado -> 500 sin filtrar detalles', async () => {
    const r = await request(app.getHttpServer()).get('/t/boom');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secreto');
    expect(r.body.code).toBe('ERROR_INTERNO');
  });

  it('X-Correlation-Id se respeta o se genera, y aparece en el error', async () => {
    const r = await request(app.getHttpServer()).get('/t/negocio').set('X-Correlation-Id', 'abc-123');
    expect(r.headers['x-correlation-id']).toBe('abc-123');
    expect(r.body.correlationId).toBe('abc-123');
    const g = await request(app.getHttpServer()).get('/t/negocio');
    expect(g.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('paginacion: {items, siguiente} y validacion de limite', async () => {
    const ok = await request(app.getHttpServer()).get('/t/lista?limite=10');
    expect(ok.body).toEqual({ items: [1, 2], siguiente: codificarCursor({ k: 10 }) });
    const mal = await request(app.getHttpServer()).get('/t/lista?limite=500');
    expect(mal.status).toBe(400);
  });

  it('cursor: ida y vuelta y rechazo de basura', () => {
    expect(decodificarCursor(codificarCursor({ a: 1 }))).toEqual({ a: 1 });
    expect(decodificarCursor('%%%no-es-base64')).toBeUndefined();
    expect(decodificarCursor(undefined)).toBeUndefined();
  });
});
