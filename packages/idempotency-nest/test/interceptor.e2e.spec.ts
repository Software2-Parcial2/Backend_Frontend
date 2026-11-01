import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, INestApplication, Post, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Idempotent, IdempotencyModule, InMemoryIdempotencyStore } from '../src/index.js';

let executions = 0;
let failNext = false;

@Controller('api/demo')
class DemoController {
  @Post()
  @Idempotent()
  async create(@Body() body: { n?: number; delay?: number }) {
    executions++;
    if (failNext) {
      failNext = false;
      throw new Error('fallo inesperado'); // 500
    }
    if (body.n === -1) throw new BadRequestException('n invalido'); // 400 de negocio
    await new Promise((r) => setTimeout(r, body.delay ?? 0));
    return { id: executions, n: body.n };
  }

  @Post('accepted')
  @HttpCode(202)
  @Idempotent()
  accepted() {
    executions++;
    return { citaId: randomUUID() };
  }
}

describe('Idempotent (interceptor)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdempotencyModule.forRoot({ store: new InMemoryIdempotencyStore() })],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    executions = 0;
  });

  const post = (path: string, key: string | undefined, body: object) => {
    const r = request(app.getHttpServer()).post(path);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  };

  it('sin cabecera -> 400 problem+json', async () => {
    const res = await post('/api/demo', undefined, { n: 1 }).expect(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.title).toMatch(/Idempotency-Key/);
    expect(executions).toBe(0);
  });

  it('repeticion -> misma respuesta con Idempotent-Replay y sin ejecutar otra vez', async () => {
    const key = randomUUID();
    const first = await post('/api/demo', key, { n: 7 }).expect(201);
    expect(first.headers['idempotent-replay']).toBeUndefined();
    const again = await post('/api/demo', key, { n: 7 }).expect(201);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect(executions).toBe(1);
  });

  it('respeta el @HttpCode del endpoint al reproducir (202)', async () => {
    const key = randomUUID();
    const first = await post('/api/demo/accepted', key, {}).expect(202);
    const again = await post('/api/demo/accepted', key, {}).expect(202);
    expect(again.body).toEqual(first.body);
    expect(executions).toBe(1);
  });

  it('mismo cuerpo con otro orden de claves cuenta como repeticion', async () => {
    const key = randomUUID();
    await post('/api/demo', key, { n: 1, delay: 0 }).expect(201);
    const again = await post('/api/demo', key, { delay: 0, n: 1 }).expect(201);
    expect(again.headers['idempotent-replay']).toBe('true');
  });

  it('misma clave con cuerpo distinto -> 422 problem+json', async () => {
    const key = randomUUID();
    await post('/api/demo', key, { n: 1 }).expect(201);
    const res = await post('/api/demo', key, { n: 2 }).expect(422);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(executions).toBe(1);
  });

  it('dos peticiones simultaneas: una ejecuta y la otra recibe 409 con Retry-After', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      post('/api/demo', key, { n: 3, delay: 400 }),
      post('/api/demo', key, { n: 3, delay: 400 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.headers['retry-after']).toBe('1');
    expect(conflict.headers['content-type']).toMatch(/problem\+json/);
    expect(executions).toBe(1);
    // Tras terminar, repetir devuelve la respuesta guardada.
    const replay = await post('/api/demo', key, { n: 3, delay: 400 }).expect(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
  });

  it('un error de negocio 4xx se guarda y se reproduce', async () => {
    const key = randomUUID();
    await post('/api/demo', key, { n: -1 }).expect(400);
    const again = await post('/api/demo', key, { n: -1 }).expect(400);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(executions).toBe(1);
  });

  it('un 500 libera la clave: el reintento con la misma clave se ejecuta', async () => {
    const key = randomUUID();
    failNext = true;
    await post('/api/demo', key, { n: 5 }).expect(500);
    const retry = await post('/api/demo', key, { n: 5 }).expect(201);
    expect(retry.headers['idempotent-replay']).toBeUndefined();
    expect(executions).toBe(2);
  });
});
