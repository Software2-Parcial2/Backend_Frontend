import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('ms3-citas (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health es publico', () =>
    request(app.getHttpServer()).get('/health').expect(200));

  it('GET /api/citas sin token da 401', () =>
    request(app.getHttpServer()).get('/api/citas').expect(401));

  it('POST /api/citas sin token da 401 (la autenticacion va antes que la idempotencia)', () =>
    request(app.getHttpServer()).post('/api/citas').set('Idempotency-Key', '6f1d4c3e-7a55-4a6f-9d3e-0c1f8a2b4d11').send({}).expect(401));

  it('GET /api/citas con token invalido da 401', () =>
    request(app.getHttpServer()).get('/api/citas').set('Authorization', 'Bearer abc').expect(401));
});
