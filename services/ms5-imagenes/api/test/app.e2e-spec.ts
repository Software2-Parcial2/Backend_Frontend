import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('ms5-api (e2e)', () => {
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

  it('GET /api/imagenes sin token da 401', () =>
    request(app.getHttpServer()).get('/api/imagenes').expect(401));

  it('GET /api/imagenes con token invalido da 401', () =>
    request(app.getHttpServer()).get('/api/imagenes').set('Authorization', 'Bearer abc').expect(401));
});
