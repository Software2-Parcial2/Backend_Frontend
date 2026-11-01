import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('ms8-notificaciones (e2e)', () => {
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

  it('GET /api/notificaciones sin token da 401', () =>
    request(app.getHttpServer()).get('/api/notificaciones').expect(401));

  it('GET /api/notificaciones con token invalido da 401', () =>
    request(app.getHttpServer()).get('/api/notificaciones').set('Authorization', 'Bearer abc').expect(401));
});
