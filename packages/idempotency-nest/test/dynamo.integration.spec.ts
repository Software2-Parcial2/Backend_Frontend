import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createDocClient, DynamoIdempotencyStore, DynamoMessageDeduplicator, IdempotencyService, MessageInProgressError } from '../src/index.js';

// Integracion contra DynamoDB Local (docker compose). Se omite si no responde:
//   DYNAMODB_ENDPOINT=http://localhost:8000 pnpm test
process.env.DYNAMODB_ENDPOINT ??= 'http://localhost:8000';
const doc = createDocClient();
const raw = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT, region: 'sa-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const table = `test_idem_${randomUUID().slice(0, 8)}`;
const available = await raw
  .send(new CreateTableCommand({ TableName: table, AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }], BillingMode: 'PAY_PER_REQUEST' }))
  .then(() => true)
  .catch(() => false);

describe.skipIf(!available)('DynamoDB (integracion)', () => {
  afterAll(async () => {
    await raw.send(new DeleteTableCommand({ TableName: table })).catch(() => undefined);
  });

  it('la reserva es atomica: de 10 intentos simultaneos solo uno gana', async () => {
    const store = new DynamoIdempotencyStore(doc, table);
    const key = `u:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 10 }, () => store.reserve(key, 'h', Date.now(), Date.now() + 60_000)));
    expect(results.filter((r) => r.reserved)).toHaveLength(1);
  });

  it('complete/replay/release', async () => {
    const service = new IdempotencyService(new DynamoIdempotencyStore(doc, table));
    const key = randomUUID();
    const a = await service.begin('u', key, 'h1');
    expect(a.kind).toBe('proceed');
    if (a.kind !== 'proceed') return;
    expect((await service.begin('u', key, 'h1')).kind).toBe('in-progress');
    await service.finish(a.storageKey, { statusCode: 201, body: { ok: true } });
    expect(await service.begin('u', key, 'h1')).toEqual({ kind: 'replay', response: { statusCode: 201, body: { ok: true } } });
    expect((await service.begin('u', key, 'otro')).kind).toBe('mismatch');
    await service.abort(a.storageKey);
    expect((await service.begin('u', key, 'h1')).kind).toBe('proceed');
  });

  it('una clave vencida se puede reservar de nuevo aunque DynamoDB no la haya borrado (TTL lento)', async () => {
    const store = new DynamoIdempotencyStore(doc, table);
    const key = `u:${randomUUID()}`;
    const t0 = Date.now();
    await store.reserve(key, 'h1', t0, t0 + 1000);
    expect((await store.reserve(key, 'h1', t0 + 500, t0 + 60_000)).reserved).toBe(false);
    expect((await store.reserve(key, 'h2', t0 + 5000, t0 + 60_000)).reserved).toBe(true); // vencida
  });

  it('deduplicador: descarta COMPLETADO, bloquea PROCESANDO y recupera tras el arrendamiento', async () => {
    let now = Date.now();
    const d = new DynamoMessageDeduplicator(doc, table, () => now);
    const id = randomUUID();
    expect(await d.tryBegin(id)).toBe(true);
    await expect(d.tryBegin(id)).rejects.toBeInstanceOf(MessageInProgressError); // otro consumidor lo tiene
    now += 61_000; // vence el arrendamiento (el consumidor murio)
    expect(await d.tryBegin(id)).toBe(true);
    await d.complete(id);
    expect(await d.tryBegin(id)).toBe(false); // duplicado
    const id2 = randomUUID();
    await d.tryBegin(id2);
    await d.release(id2);
    expect(await d.tryBegin(id2)).toBe(true); // liberado tras un fallo
  });
});
