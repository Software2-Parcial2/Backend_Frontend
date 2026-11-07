import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer, Server } from 'node:http';
import request from 'supertest';
import { AuthModule, CurrentUser, Public, Roles } from '../src/index.js';
import type { AuthUser } from '../src/index.js';

const ISSUER = 'http://localhost:8080/realms/sigec';

@Controller()
class DemoController {
  @Public()
  @Get('abierta')
  abierta() {
    return { ok: true };
  }

  @Get('protegida')
  protegida(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('administrador')
  @Get('solo-admin')
  soloAdmin() {
    return { ok: true };
  }
}

describe('AuthModule', () => {
  let app: INestApplication;
  let jwksServer: Server;
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;

  const sign = (claims: Record<string, unknown>, key = privateKey, issuer = ISSUER, exp = '5m') =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(issuer)
      .setSubject('u1')
      .setExpirationTime(exp)
      .sign(key);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    jwksServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((r) => jwksServer.listen(0, r));
    const port = (jwksServer.address() as { port: number }).port;

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ issuer: ISSUER, jwksUri: `http://localhost:${port}/jwks` })],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise((r) => jwksServer.close(r));
  });

  it('permite rutas @Public sin token', () =>
    request(app.getHttpServer()).get('/abierta').expect(200));

  it('rechaza sin token (401)', () =>
    request(app.getHttpServer()).get('/protegida').expect(401));

  it('rechaza un token basura (401)', () =>
    request(app.getHttpServer()).get('/protegida').set('Authorization', 'Bearer abc').expect(401));

  it('rechaza un token firmado con otra clave (401)', async () =>
    request(app.getHttpServer())
      .get('/protegida')
      .set('Authorization', `Bearer ${await sign({}, otherKey)}`)
      .expect(401));

  it('rechaza un issuer distinto (401)', async () =>
    request(app.getHttpServer())
      .get('/protegida')
      .set('Authorization', `Bearer ${await sign({}, privateKey, 'http://otro/realms/x')}`)
      .expect(401));

  it('rechaza un token expirado (401)', async () =>
    request(app.getHttpServer())
      .get('/protegida')
      .set('Authorization', `Bearer ${await sign({}, privateKey, ISSUER, '-1m')}`)
      .expect(401));

  it('rechaza un token sin sub (401): sin identidad no se distingue a un usuario de otro', async () => {
    const sinSub = await new SignJWT({ realm_access: { roles: ['administrador'] } })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setExpirationTime('5m')
      .sign(privateKey);
    await request(app.getHttpServer()).get('/protegida').set('Authorization', `Bearer ${sinSub}`).expect(401);
  });

  it('expone usuario y roles con un token valido', async () => {
    const token = await sign({
      preferred_username: 'recepcion',
      realm_access: { roles: ['recepcion'] },
    });
    const res = await request(app.getHttpServer())
      .get('/protegida')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ sub: 'u1', username: 'recepcion', roles: ['recepcion'] });
    const conPaciente = await sign({ realm_access: { roles: ['paciente'] }, paciente_id: 'a0000000-0000-4000-8000-000000000001' });
    const r2 = await request(app.getHttpServer()).get('/protegida').set('Authorization', `Bearer ${conPaciente}`).expect(200);
    expect(r2.body.pacienteId).toBe('a0000000-0000-4000-8000-000000000001');
  });

  it('@Roles: 403 sin el rol y 200 con el rol', async () => {
    const medico = await sign({ realm_access: { roles: ['medico'] } });
    const admin = await sign({ realm_access: { roles: ['administrador'] } });
    await request(app.getHttpServer()).get('/solo-admin').set('Authorization', `Bearer ${medico}`).expect(403);
    await request(app.getHttpServer()).get('/solo-admin').set('Authorization', `Bearer ${admin}`).expect(200);
  });
});
