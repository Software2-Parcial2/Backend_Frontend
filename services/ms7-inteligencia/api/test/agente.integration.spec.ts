import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthModule } from '@sigec/auth-nest';
import ExcelJS from 'exceljs';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AgenteService, OPCIONES_AGENTE } from '../src/application/agente/agente.service.js';
import { AuditoriaEnMemoria } from '../src/application/agente/auditoria.js';
import { AUDITORIA_PORT, LLM_PORT, POLITICAS_PORT } from '../src/application/agente/ports.js';
import { GestionService } from '../src/application/gestion.service.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY } from '../src/application/ports.js';
import { AudioRechazadoError, TRANSCRIPCION_PORT, type TranscripcionPort } from '../src/application/voz/ports.js';
import { VozService } from '../src/application/voz/voz.service.js';
import { ReportesService } from '../src/application/reportes/reportes.service.js';
import { AgenteController } from '../src/infrastructure/http/agente.controller.js';
import { SimuladoLlm } from '../src/infrastructure/llm/simulado.llm.js';

const ISSUER = 'http://localhost:8080/realms/sigec';
const futuro = new Date(Date.now() + 3 * 86_400_000).toISOString();
const citas = [
  { citaId: 'c1', estado: 'CONFIRMADA', pacienteId: 'p1', medicoId: 'm1', especialidad: 'Pediatria', fechaHora: new Date(Date.now() - 5 * 86_400_000).toISOString(), notificacion: 'ENVIADA', creadaEn: new Date(Date.now() - 9 * 86_400_000).toISOString() },
  { citaId: 'c2', estado: 'CANCELADA', pacienteId: 'p2', medicoId: 'm1', especialidad: 'Cardiologia', fechaHora: new Date(Date.now() - 2 * 86_400_000).toISOString(), notificacion: 'ENVIADA', creadaEn: new Date(Date.now() - 8 * 86_400_000).toISOString() },
  { citaId: 'c3', estado: 'CONFIRMADA', pacienteId: 'p1', medicoId: 'm2', especialidad: 'Pediatria', fechaHora: futuro, notificacion: 'PENDIENTE', creadaEn: new Date().toISOString() },
];

describe('Agente y reportes por HTTP (JWT firmados, proveedor simulado)', () => {
  let app: INestApplication;
  let transcribir: TranscripcionPort['transcribir'] = async () => ({ texto: 'resumen de citas por medico', idioma: 'es', duracionS: 2.1, modelo: 'falso' });
  let jwks: Server;
  let key: CryptoKey;
  const token = (roles: string[]) =>
    new SignJWT({ realm_access: { roles }, preferred_username: `u-${roles[0]}` }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(`sub-${roles[0]}`).setIssuer(ISSUER).setIssuedAt().setExpirationTime('5m').sign(key);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    jwks = createServer((_q, res) => res.setHeader('content-type', 'application/json').end(JSON.stringify({ keys: [jwk] })));
    await new Promise<void>((ok) => jwks.listen(0, ok));
    const mod = await Test.createTestingModule({
      imports: [AuthModule.forRoot({ issuer: ISSUER, jwksUri: `http://localhost:${(jwks.address() as { port: number }).port}/` })],
      controllers: [AgenteController],
      providers: [
        { provide: CITAS_GATEWAY, useValue: { listar: async () => ({ items: citas, siguiente: null }) } },
        { provide: FACTURACION_GATEWAY, useValue: { ingresos: vi.fn(async () => [{ periodo: '2026-05', confirmado: 100, provisional: 0, facturas: 2 }]) } },
        { provide: ML_GATEWAY, useValue: {
          demanda: async () => ({ k: 2, silueta: 0.4, fuente: 'test', sintetico: false, segmentos: [], especialidades: [{ especialidad: 'Pediatria', segmento: 0, etiqueta: 'Demanda alta', citasPorSemana: 30, citasTotal: 360 }] }),
          predecirNoShow: async (items: { id: string }[]) => ({ predicciones: items.map((i) => ({ id: i.id, probabilidad_inasistencia: 0.4, riesgo: 'MEDIO' })), version_modelo: 'v', sintetico: true }) } },
        { provide: TRANSCRIPCION_PORT, useValue: { transcribir: (...a: Parameters<TranscripcionPort['transcribir']>) => transcribir(...a) } },
        VozService,
        { provide: LLM_PORT, useValue: new SimuladoLlm() },
        { provide: AUDITORIA_PORT, useValue: new AuditoriaEnMemoria() },
        { provide: POLITICAS_PORT, useValue: { buscar: async () => [] } },
        { provide: OPCIONES_AGENTE, useValue: { maxIteraciones: 4, timeoutMs: 5000, maxLlamadasPorTurno: 3, maxConsultasPorHora: 100 } },
        GestionService, ReportesService, AgenteService,
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); jwks.close(); });

  const post = async (ruta: string, roles: string[] | null, cuerpo: object) => {
    const r = request(app.getHttpServer()).post(ruta).send(cuerpo);
    return roles ? r.set('Authorization', `Bearer ${await token(roles)}`) : r;
  };

  it('401 sin token y 403 para pacientes/medicos', async () => {
    expect((await post('/api/inteligencia/agente/consulta', null, { texto: 'citas' })).status).toBe(401);
    expect((await post('/api/inteligencia/agente/consulta', ['paciente'], { texto: 'citas' })).status).toBe(403);
    expect((await post('/api/inteligencia/reportes', ['medico'], {})).status).toBe(403);
  });

  it('valida el texto de la consulta', async () => {
    expect((await post('/api/inteligencia/agente/consulta', ['administrador'], { texto: 'x' })).status).toBe(400);
    expect((await post('/api/inteligencia/agente/consulta', ['administrador'], { texto: 'a'.repeat(1001) })).status).toBe(400);
    expect((await post('/api/inteligencia/agente/consulta', ['administrador'], { texto: 'hola', extra: 1 })).status).toBe(400);
  });

  it('consulta de texto: responde con herramientas usadas', async () => {
    const r = await post('/api/inteligencia/agente/consulta', ['administrador'], { texto: 'Dame el resumen de citas por medico' });
    expect(r.status).toBe(201);
    expect(r.body.herramientasUsadas[0]).toMatchObject({ nombre: 'obtener_resumen_citas', ok: true });
    expect(r.body.respuesta).toContain('m1');
    expect(r.body.proveedor).toBe('simulado');
  });

  it('recepcion no puede consultar ingresos por el agente (la herramienta no existe para su rol)', async () => {
    const r = await post('/api/inteligencia/agente/consulta', ['recepcion'], { texto: 'cuales son los ingresos' });
    expect(r.body.herramientasUsadas).toEqual([expect.objectContaining({ nombre: 'consultar_ingresos', ok: false })]);
  });

  it('reporte Excel: .xlsx valido con las columnas esperadas', async () => {
    const spec = { titulo: 'Citas por especialidad', fuente: 'resumen_citas', parametros: { desde: new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10), hasta: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) }, columnas: ['clave', 'total', 'confirmadas'], grafico: { tipo: 'barras', x: 'clave', y: 'total' } };
    const r = await post('/api/inteligencia/reportes?formato=xlsx', ['administrador'], spec).then((x) => x);
    expect(r.status).toBe(201);
    expect(r.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(r.headers['content-disposition']).toContain('.xlsx');
  });

  it('reportes: json, csv, pdf, formato invalido y especificacion invalida', async () => {
    const spec = { titulo: 'Demanda', fuente: 'demanda', columnas: ['especialidad', 'etiqueta', 'citasPorSemana'] };
    const j = await post('/api/inteligencia/reportes', ['recepcion'], spec);
    expect(j.body.filas).toEqual([{ especialidad: 'Pediatria', etiqueta: 'Demanda alta', citasPorSemana: 30 }]);
    expect((await post('/api/inteligencia/reportes?formato=csv', ['recepcion'], spec)).text).toContain('Especialidad,Segmento,Citas por semana');
    expect((await post('/api/inteligencia/reportes?formato=pdf', ['recepcion'], spec)).headers['content-type']).toContain('application/pdf');
    expect((await post('/api/inteligencia/reportes?formato=doc', ['recepcion'], spec)).status).toBe(400);
    const mala = await post('/api/inteligencia/reportes', ['administrador'], { ...spec, sql: 'DROP TABLE citas' });
    expect(mala.status).toBe(400);
    expect(mala.body.message).toMatch(/invalida/);
    expect((await post('/api/inteligencia/reportes', ['recepcion'], { titulo: 'Ingresos', fuente: 'ingresos', columnas: ['periodo'] })).status).toBe(403);
  });

  it('el contenido del xlsx descargado se puede abrir', async () => {
    const spec = { titulo: 'Ingresos', fuente: 'ingresos', columnas: ['periodo', 'confirmado', 'facturas'] };
    const token_ = await token(['caja']);
    const res = await request(app.getHttpServer()).post('/api/inteligencia/reportes?formato=xlsx').set('Authorization', `Bearer ${token_}`).send(spec)
      .buffer(true).parse((resp, cb) => { const t: Buffer[] = []; resp.on('data', (d: Buffer) => t.push(d)); resp.on('end', () => cb(null, Buffer.concat(t))); });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    const hoja = wb.getWorksheet('Datos')!;
    expect((hoja.getRow(1).values as string[]).slice(1)).toEqual(['Periodo', 'Confirmado', 'Facturas']);
    expect(hoja.getRow(2).getCell(2).value).toBe(100);
  });

  const subirAudio = async (roles: string[] | null, adjunto: { buf: Buffer; tipo: string } | null) => {
    const r = request(app.getHttpServer()).post('/api/inteligencia/agente/voz');
    if (roles) r.set('Authorization', `Bearer ${await token(roles)}`);
    if (adjunto) r.attach('audio', adjunto.buf, { filename: 'consulta.webm', contentType: adjunto.tipo });
    return r;
  };

  it('voz: transcribe, consulta al agente y devuelve ambos para confirmar', async () => {
    const r = await subirAudio(['administrador'], { buf: Buffer.from('audio-falso'), tipo: 'audio/webm' });
    expect(r.status).toBe(201);
    expect(r.body.transcripcion).toEqual({ texto: 'resumen de citas por medico', idioma: 'es', duracionS: 2.1, modelo: 'falso' });
    expect(r.body.herramientasUsadas[0]).toMatchObject({ nombre: 'obtener_resumen_citas', ok: true });
    expect(r.body.respuesta).toContain('m1');
  });

  it('voz: 401 sin token, 403 paciente, 422 sin archivo, 415 tipo no soportado', async () => {
    const audio = { buf: Buffer.from('x'), tipo: 'audio/webm' };
    expect((await subirAudio(null, audio)).status).toBe(401);
    expect((await subirAudio(['paciente'], audio)).status).toBe(403);
    expect((await subirAudio(['administrador'], null)).status).toBe(422);
    expect((await subirAudio(['administrador'], { buf: Buffer.from('MZ...'), tipo: 'application/x-msdownload' })).status).toBe(415);
  });

  it('voz: errores de Whisper (audio largo, ilegible, sin voz, servicio caido)', async () => {
    const audio = { buf: Buffer.from('x'), tipo: 'audio/wav' };
    transcribir = async () => { throw new AudioRechazadoError(413, 'El audio dura 120.0 s y el maximo es 60 s'); };
    expect((await subirAudio(['administrador'], audio)).status).toBe(413);
    transcribir = async () => ({ texto: '  ', idioma: 'es', duracionS: 1, modelo: 'f' });
    const vacio = await subirAudio(['administrador'], audio);
    expect(vacio.status).toBe(422);
    expect(vacio.body.message).toMatch(/No se entendio/);
    transcribir = async () => { throw new (await import('../src/domain/gestion.js')).ServicioNoDisponibleError('MS7 Whisper', 'ECONNREFUSED'); };
    expect((await subirAudio(['administrador'], audio)).status).toBe(503);
    transcribir = async () => ({ texto: 'resumen de citas por medico', idioma: 'es', duracionS: 2.1, modelo: 'falso' });
  });

  it('la auditoria solo la ve el administrador', async () => {
    const r = (rol: string) => token([rol]).then((t) => request(app.getHttpServer()).get('/api/inteligencia/agente/auditoria').set('Authorization', `Bearer ${t}`));
    expect((await r('recepcion')).status).toBe(403);
    const a = await r('administrador');
    expect(a.status).toBe(200);
    expect(a.body.registros.length).toBeGreaterThan(0);
    expect(a.body.registros[0]).toHaveProperty('herramienta');
  });
});
