import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { AuthModule } from '@sigec/auth-nest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GestionService } from '../src/application/gestion.service.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY } from '../src/application/ports.js';
import { graphqlConfig } from '../src/infrastructure/graphql/graphql.config.js';
import { GestionResolver } from '../src/infrastructure/graphql/gestion.resolver.js';

const ISSUER = 'http://localhost:8080/realms/sigec';
const manana = new Date(Date.now() + 2 * 86_400_000).toISOString();
const citas = Array.from({ length: 30 }, (_, i) => ({
  citaId: `c${i}`, estado: 'CONFIRMADA', pacienteId: `p${i % 5}`, medicoId: 'm1', especialidad: i % 2 ? 'Pediatria' : 'Cardiologia',
  fechaHora: manana, notificacion: 'ENVIADA', creadaEn: new Date().toISOString(),
}));

describe('GraphQL /graphql (integracion con JWT firmados)', () => {
  let app: INestApplication;
  let jwks: Server;
  let key: CryptoKey;
  const listar = vi.fn(async (_i: unknown, q: { cursor?: string } & object) => ({ items: q.cursor ? [] : citas, siguiente: null }));
  const predecir = vi.fn(async (items: { id: string }[]) => ({
    predicciones: items.map((x) => ({ id: x.id, probabilidad_inasistencia: 0.3, riesgo: 'BAJO' as const })), version_modelo: 'v-test', sintetico: true,
  }));
  const ingresos = vi.fn(async () => [{ periodo: '2026-06', confirmado: 100, provisional: 5, facturas: 3 }]);

  const token = (roles: string[], opts: { exp?: string; issuer?: string } = {}) =>
    new SignJWT({ realm_access: { roles }, preferred_username: 'u-test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject('u1').setIssuer(opts.issuer ?? ISSUER).setIssuedAt().setExpirationTime(opts.exp ?? '5m').sign(key);
  const gql = async (query: string, tk?: string, variables?: object) => {
    const r = request(app.getHttpServer()).post('/graphql').send({ query, variables });
    return tk ? r.set('Authorization', `Bearer ${tk}`) : r;
  };

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    jwks = createServer((_q, res) => res.setHeader('content-type', 'application/json').end(JSON.stringify({ keys: [jwk] })));
    await new Promise<void>((ok) => jwks.listen(0, ok));
    const puerto = (jwks.address() as { port: number }).port;

    const mod = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ issuer: ISSUER, jwksUri: `http://localhost:${puerto}/` }), GraphQLModule.forRoot(graphqlConfig({ NODE_ENV: 'test', GRAPHQL_MAX_DEPTH: '4' }))],
      providers: [
        { provide: CITAS_GATEWAY, useValue: { listar } },
        { provide: FACTURACION_GATEWAY, useValue: { ingresos } },
        { provide: ML_GATEWAY, useValue: { predecirNoShow: predecir, demanda: vi.fn() } },
        GestionService, GestionResolver,
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); jwks.close(); });

  it('sin token o con token invalido: 401', async () => {
    // GraphQL responde 200 con `errors`; el codigo lo marca la excepcion HTTP de los guards.
    const sinAcceso = (r: { body: any }) => {
      const b = r.body;
      return { datos: b.data, estado: b.errors?.[0]?.extensions?.originalError?.statusCode ?? b.errors?.[0]?.extensions?.code };
    };
    for (const tk of [undefined, 'abc', await token(['administrador'], { exp: '-1m' }), await token(['administrador'], { issuer: 'http://otro/realms/x' })]) {
      const r = sinAcceso(await gql('{ citas { items { citaId } } }', tk));
      expect(r.datos).toBeFalsy();
      expect([401, 'UNAUTHENTICATED']).toContain(r.estado);
    }
    expect(listar).not.toHaveBeenCalled();
  });

  it('el rol paciente/medico no accede a la gestion (403)', async () => {
    for (const rol of ['paciente', 'medico']) {
      const r = await gql('{ citas { items { citaId } } }', await token([rol]));
      expect(r.body.errors?.[0]?.extensions?.code ?? r.body.errors?.[0]?.extensions?.originalError?.statusCode).toBeTruthy();
      expect(JSON.stringify(r.body)).toMatch(/Rol insuficiente|FORBIDDEN|403/);
      expect(r.body.data).toBeFalsy();
    }
  });

  it('ingresos: solo administrador y caja; recepcion recibe 403', async () => {
    const q = '{ ingresos(desde: "2026-06-01", hasta: "2026-06-30") { periodo confirmado facturas } }';
    const ok = await gql(q, await token(['caja']));
    expect(ok.body.data.ingresos).toEqual([{ periodo: '2026-06', confirmado: 100, facturas: 3 }]);
    expect(ingresos).toHaveBeenCalledWith(expect.objectContaining({ token: expect.any(String) }), { desde: '2026-06-01', hasta: '2026-06-30', agrupar: 'mes' });
    expect(JSON.stringify((await gql(q, await token(['recepcion']))).body)).toMatch(/Rol insuficiente/);
  });

  it('propaga el token del usuario a los servicios aguas abajo', async () => {
    const tk = await token(['administrador']);
    await gql('{ citas(limite: 5) { items { citaId } } }', tk);
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ token: tk, roles: ['administrador'] }), expect.anything());
  });

  it('evita el N+1: riesgo de 30 citas = UNA llamada a ML', async () => {
    predecir.mockClear();
    const r = await gql('{ citas(limite: 100) { items { citaId riesgo { probabilidad riesgo sintetico atributosEstimados } } } }', await token(['administrador']));
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.citas.items).toHaveLength(30);
    expect(r.body.data.citas.items[0].riesgo).toMatchObject({ probabilidad: 0.3, riesgo: 'BAJO', sintetico: true });
    expect(predecir).toHaveBeenCalledTimes(1);
    expect(predecir.mock.calls[0]?.[0]).toHaveLength(30);
  });

  it('valida argumentos (limite, fechas, enums)', async () => {
    const tk = await token(['administrador']);
    expect(JSON.stringify((await gql('{ citas(limite: 1000) { items { citaId } } }', tk)).body)).toMatch(/limite/);
    expect(JSON.stringify((await gql('{ resumenCitas(desde: "ayer", hasta: "hoy") { total } }', tk)).body)).toMatch(/desde|ISO/);
    expect((await gql('{ resumenCitas(desde: "2026-06-01", hasta: "2026-06-30", agruparPor: SEXO) { total } }', tk)).body.errors).toBeDefined();
  });

  it('rechaza consultas demasiado complejas antes de ejecutarlas', async () => {
    listar.mockClear();
    const aliases = Array.from({ length: 130 }, (_, i) => `a${i}: demandaEspecialidades { k }`).join(' ');
    const r = await gql(`{ ${aliases} }`, await token(['administrador']));
    expect(r.body.errors[0].message).toMatch(/demasiado compleja/);
    expect(r.body.data).toBeUndefined();
  });

  it('el resumen funciona de extremo a extremo', async () => {
    const r = await gql(
      '{ resumenCitas(desde: "2000-01-01", hasta: "2030-12-31", agruparPor: ESPECIALIDAD) { total truncado grupos { clave total } } }'.replace('2000', '2026').replace('2030-12-31', '2026-12-31'),
      await token(['recepcion']),
    );
    expect(r.body.data.resumenCitas.total).toBe(30);
    expect(r.body.data.resumenCitas.grupos).toEqual([{ clave: 'Cardiologia', total: 15 }, { clave: 'Pediatria', total: 15 }]);
  });
});

describe('introspeccion', () => {
  it('se desactiva en produccion', () => {
    expect(graphqlConfig({ NODE_ENV: 'production' }).introspection).toBe(false);
    expect(graphqlConfig({ NODE_ENV: 'development' }).introspection).toBe(true);
  });
});
