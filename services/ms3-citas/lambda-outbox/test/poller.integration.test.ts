// Integracion: DynamoDB Local + RabbitMQ reales (docker compose up -d). Se omite si no estan disponibles.
//   set -a; source ../../../.env; set +a; npm test
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import amqp from 'amqplib';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { AmqpPublisher, rabbitUrlFromEnv } from '../src/amqp.ts';
import { OutboxPoller } from '../src/poller.ts';
import type { RecordPublisher } from '../src/publisher.ts';
import { buildOutboxItem, createEnvelope } from '../../../../packages/messaging-nest/dist/index.js';

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const creds = { accessKeyId: 'local', secretAccessKey: 'local' };
const raw = new DynamoDBClient({ endpoint, region: 'sa-east-1', credentials: creds });
const doc = DynamoDBDocumentClient.from(raw);
const url = rabbitUrlFromEnv();

const outboxTable = `test_outbox_${randomUUID().slice(0, 8)}`;
const bizTable = `test_biz_${randomUUID().slice(0, 8)}`;

const available = await (async () => {
  try {
    const c = await amqp.connect(url);
    await c.close();
    await raw.send(new CreateTableCommand({
      TableName: outboxTable,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      StreamSpecification: { StreamEnabled: true, StreamViewType: 'NEW_IMAGE' },
    }));
    await raw.send(new CreateTableCommand({
      TableName: bizTable,
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    }));
    return true;
  } catch {
    return false;
  }
})();

test('outbox DynamoDB: transaccion negocio+outbox -> poller -> RabbitMQ, sin duplicados y reanudando tras un fallo', { skip: !available }, async (t) => {
  t.after(async () => {
    await raw.send(new DeleteTableCommand({ TableName: outboxTable })).catch(() => undefined);
    await raw.send(new DeleteTableCommand({ TableName: bizTable })).catch(() => undefined);
  });

  // Cola de verificacion enlazada a sigec.eventos.
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  const queue = `test.outbox.${randomUUID().slice(0, 8)}`;
  await ch.assertExchange('sigec.eventos', 'topic', { durable: true });
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, 'sigec.eventos', 'cita.#');
  t.after(async () => {
    await ch.deleteQueue(queue).catch(() => undefined);
    await conn.close().catch(() => undefined);
  });
  const drain = async () => {
    const ids: string[] = [];
    for (;;) {
      const m = await ch.get(queue, { noAck: true });
      if (!m) return ids;
      ids.push(JSON.parse(m.content.toString()).id);
      assert.equal(m.properties.deliveryMode, 2, 'persistente');
    }
  };

  // 1) El cambio de negocio y el evento se escriben en UNA transaccion.
  const correlationId = randomUUID();
  const e1 = createEnvelope({ type: 'cita.reservada', correlationId, payload: { citaId: randomUUID() } });
  const e2 = createEnvelope({ type: 'cita.confirmada', correlationId, payload: { citaId: randomUUID() } });
  for (const e of [e1, e2]) {
    await doc.send(new TransactWriteCommand({
      TransactItems: [{ Put: { TableName: bizTable, Item: { pk: randomUUID(), tipo: e.type } } }, buildOutboxItem(outboxTable, e)],
    }));
  }

  const checkpointFile = `${mkdtempSync(`${tmpdir()}/outbox-`)}/cp.json`;
  const amqpPublisher = new AmqpPublisher(url);
  t.after(() => amqpPublisher.close());

  // 2) Fallo del broker: el poller no avanza el checkpoint.
  const roto: RecordPublisher = { publish: async () => { throw new Error('RabbitMQ caido'); } };
  const pollerRoto = new OutboxPoller({ endpoint, tableName: outboxTable, publisher: roto, checkpointFile });
  await assert.rejects(pollerRoto.pollOnce(), /fallo al publicar/);
  assert.deepEqual(await drain(), []);

  // 3) RabbitMQ vuelve: se publican ambos, en orden, una sola vez.
  const poller = new OutboxPoller({ endpoint, tableName: outboxTable, publisher: amqpPublisher, checkpointFile });
  assert.equal(await poller.pollOnce(), 2);
  assert.deepEqual(await drain(), [e1.id, e2.id]);

  // 4) Otra pasada: nada nuevo (checkpoint) => sin duplicados.
  assert.equal(await poller.pollOnce(), 0);
  assert.deepEqual(await drain(), []);

  // 5) Un evento nuevo despues del checkpoint se publica solo.
  const e3 = createEnvelope({ type: 'cita.cancelada', correlationId, payload: { citaId: randomUUID() } });
  await doc.send(new TransactWriteCommand({ TransactItems: [buildOutboxItem(outboxTable, e3)] }));
  assert.equal(await poller.pollOnce(), 1);
  assert.deepEqual(await drain(), [e3.id]);
});
