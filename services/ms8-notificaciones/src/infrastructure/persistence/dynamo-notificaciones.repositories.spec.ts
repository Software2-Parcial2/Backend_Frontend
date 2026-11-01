import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Notificacion, RespuestaSaga } from '../../domain/notificacion.js';
import { DynamoContactoRepository, DynamoNotificacionRepository, DynamoRecordatorioRepository } from './dynamo-notificaciones.repositories.js';

// Integracion contra DynamoDB Local (docker compose up -d). Se omite si no responde.
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const raw = new DynamoDBClient({ endpoint, region: 'sa-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const sfx = randomUUID().slice(0, 8);
const tablas = { notificaciones: `test_notif_${sfx}`, outbox: `test_ms8_outbox_${sfx}` };

const available = await (async () => {
  try {
    await raw.send(new CreateTableCommand({
      TableName: tablas.notificaciones,
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'gsi1pk', AttributeType: 'S' }, { AttributeName: 'gsi1sk', AttributeType: 'N' },
        { AttributeName: 'gsi2pk', AttributeType: 'S' }, { AttributeName: 'gsi2sk', AttributeType: 'N' },
      ],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
      GlobalSecondaryIndexes: [
        { IndexName: 'gsi1', KeySchema: [{ AttributeName: 'gsi1pk', KeyType: 'HASH' }, { AttributeName: 'gsi1sk', KeyType: 'RANGE' }], Projection: { ProjectionType: 'KEYS_ONLY' } },
        { IndexName: 'gsi2', KeySchema: [{ AttributeName: 'gsi2pk', KeyType: 'HASH' }, { AttributeName: 'gsi2sk', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }));
    await raw.send(new CreateTableCommand({ TableName: tablas.outbox, AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }], BillingMode: 'PAY_PER_REQUEST' }));
    return true;
  } catch {
    return false;
  }
})();

const nueva = (over: Partial<Notificacion> = {}): Notificacion => {
  const ahora = new Date().toISOString();
  return { id: randomUUID(), citaId: randomUUID(), pacienteId: randomUUID(), tipo: 'CITA_CONFIRMADA', estado: 'PENDIENTE', canalesEnviados: [], intentos: 1, creadaEn: ahora, actualizadaEn: ahora, version: -1, ...over };
};
const respuesta = (n: Notificacion): RespuestaSaga => ({ id: randomUUID(), type: 'notificaciones.cita-confirmada.enviada', correlationId: randomUUID(), causationId: randomUUID(), payload: { citaId: n.citaId, notificacionId: n.id, canal: 'EMAIL' } });

describe.skipIf(!available)('repositorios de MS8 (DynamoDB Local)', () => {
  const notifs = new DynamoNotificacionRepository(doc, tablas);
  const contactos = new DynamoContactoRepository(doc, tablas);
  const recordatorios = new DynamoRecordatorioRepository(doc, tablas);
  afterAll(async () => {
    await raw.send(new DeleteTableCommand({ TableName: tablas.notificaciones })).catch(() => undefined);
    await raw.send(new DeleteTableCommand({ TableName: tablas.outbox })).catch(() => undefined);
  });
  const outboxCount = async () => (await doc.send(new ScanCommand({ TableName: tablas.outbox }))).Count ?? 0;

  it('guarda la notificacion y la respuesta de la SAGA en una sola transaccion', async () => {
    const n = nueva({ estado: 'ENVIADA' });
    const antes = await outboxCount();
    await notifs.guardar(n, respuesta(n));
    expect(await outboxCount()).toBe(antes + 1);
    expect(await notifs.obtener(n.citaId, 'CITA_CONFIRMADA')).toMatchObject({ id: n.id, estado: 'ENVIADA', version: 0 });
    expect((await notifs.porCita(n.citaId)).map((x) => x.id)).toEqual([n.id]);
  });

  it('el control de version rechaza una escritura obsoleta y no deja la respuesta a medias', async () => {
    const n = nueva();
    await notifs.guardar(n, null);
    const actual = (await notifs.obtener(n.citaId, n.tipo))!;
    await notifs.guardar({ ...actual, intentos: 2 }, null);
    const antes = await outboxCount();
    await expect(notifs.guardar({ ...actual, estado: 'ENVIADA' }, respuesta(actual))).rejects.toThrow(); // version vieja
    expect(await outboxCount()).toBe(antes);
    await expect(notifs.guardar(nueva({ citaId: n.citaId }), null)).rejects.toThrow(); // ya existe (version -1)
  });

  it('el indice de pendientes devuelve solo las que vencieron, y deja de listar las finalizadas', async () => {
    const ahora = Date.now();
    const a = nueva({ proximoIntento: ahora - 1000 });
    const b = nueva({ proximoIntento: ahora + 60_000 });
    await notifs.guardar(a, null);
    await notifs.guardar(b, null);
    const venc = (await notifs.vencidas(ahora)).map((x) => x.citaId);
    expect(venc).toContain(a.citaId);
    expect(venc).not.toContain(b.citaId);
    const actual = (await notifs.obtener(a.citaId, a.tipo))!;
    await notifs.guardar({ ...actual, estado: 'ENVIADA', proximoIntento: undefined }, null);
    expect((await notifs.vencidas(ahora)).map((x) => x.citaId)).not.toContain(a.citaId);
  });

  it('contactos: guarda y recupera preferencias y chat', async () => {
    const id = randomUUID();
    expect(await contactos.obtener(id)).toBeNull();
    await contactos.guardar({ pacienteId: id, nombre: 'Ana', email: 'a@x.com', canales: ['EMAIL', 'TELEGRAM'], telegramChatId: '99' });
    expect(await contactos.obtener(id)).toEqual({ pacienteId: id, nombre: 'Ana', email: 'a@x.com', canales: ['EMAIL', 'TELEGRAM'], telegramChatId: '99' });
  });

  it('el codigo de vinculo se consume UNA sola vez, incluso con 8 intentos simultaneos, y solo antes de expirar', async () => {
    const pac = randomUUID();
    const now = Date.now();
    await contactos.crearVinculo('SIMULT01', pac, now + 600_000);
    const res = await Promise.all(Array.from({ length: 8 }, () => contactos.consumirVinculo('SIMULT01', now)));
    expect(res.filter((r) => r === pac)).toHaveLength(1);
    expect(res.filter((r) => r === null)).toHaveLength(7);

    await contactos.crearVinculo('EXPIRA001', pac, now + 1000);
    expect(await contactos.consumirVinculo('EXPIRA001', now + 5000)).toBeNull(); // expirado
    expect(await contactos.consumirVinculo('NOEXISTE1', now)).toBeNull();
    await expect(contactos.crearVinculo('SIMULT01', randomUUID(), now + 1000)).rejects.toThrow(); // no pisa un codigo existente
  });

  it('recordatorios: lista por rango, y marcar saca la cita de la lista', async () => {
    const ahora = Date.now();
    const dentro = { citaId: randomUUID(), pacienteId: randomUUID(), fechaHora: new Date(ahora + 3_600_000).toISOString() };
    const lejos = { citaId: randomUUID(), pacienteId: randomUUID(), fechaHora: new Date(ahora + 48 * 3_600_000).toISOString() };
    await recordatorios.registrar(dentro);
    await recordatorios.registrar(lejos);
    const ids = (await recordatorios.pendientes(ahora, ahora + 24 * 3_600_000)).map((c) => c.citaId);
    expect(ids).toContain(dentro.citaId);
    expect(ids).not.toContain(lejos.citaId);
    await recordatorios.marcar(dentro.citaId);
    expect((await recordatorios.pendientes(ahora, ahora + 24 * 3_600_000)).map((c) => c.citaId)).not.toContain(dentro.citaId);
    expect(await recordatorios.obtener(dentro.citaId)).toMatchObject({ citaId: dentro.citaId }); // sigue existiendo
  });
});
