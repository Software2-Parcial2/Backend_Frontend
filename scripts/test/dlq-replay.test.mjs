// Integracion con el RabbitMQ real (set -a; source ../.env; set +a; npm test). Se omite si no esta disponible.
import amqp from 'amqplib';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { defaultUrl, replay } from '../dlq-replay.mjs';

const url = defaultUrl();
const available = await amqp.connect(url).then((c) => c.close().then(() => true)).catch(() => false);

test('dlq-replay mueve mensajes a la cola original conservando cuerpo y message_id', { skip: !available }, async (t) => {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  const q = `test.dlqreplay.${randomUUID().slice(0, 8)}`;
  await ch.assertQueue(q, { durable: true });
  await ch.assertQueue(`${q}.dlq`, { durable: true });
  t.after(async () => {
    await ch.deleteQueue(q).catch(() => undefined);
    await ch.deleteQueue(`${q}.dlq`).catch(() => undefined);
    await conn.close().catch(() => undefined);
  });

  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of ids) {
    const body = JSON.stringify({ id, type: 'facturacion.cobro.anular' });
    ch.sendToQueue(`${q}.dlq`, Buffer.from(body), { persistent: true, messageId: id, headers: { 'x-retries': 3, 'x-last-error': 'boom' } });
  }
  await new Promise((r) => setTimeout(r, 200));

  const r1 = await replay({ url, queue: q, limit: 2 });
  assert.deepEqual([r1.moved, r1.remaining, r1.to], [2, 1, q]);

  const got = [];
  for (let i = 0; i < 2; i++) got.push(await ch.get(q, { noAck: true }));
  assert.deepEqual(got.map((m) => m.properties.messageId), ids.slice(0, 2), 'mismo message_id y orden');
  assert.deepEqual(got.map((m) => JSON.parse(m.content.toString()).id), ids.slice(0, 2), 'mismo cuerpo (id del sobre)');
  assert.equal(got[0].properties.deliveryMode, 2, 'persistente');
  assert.equal(got[0].properties.headers['x-retries'], undefined, 'contador de reintentos reiniciado');
  assert.equal(got[0].properties.headers['x-replayed-from'], `${q}.dlq`);
  assert.equal(got[0].properties.headers['x-previous-error'], 'boom');

  // acepta tambien el nombre de la DLQ y procesa el resto
  const r2 = await replay({ url, queue: `${q}.dlq` });
  assert.deepEqual([r2.moved, r2.remaining], [1, 0]);
  assert.equal((await replay({ url, queue: q })).moved, 0, 'sin mensajes: no hace nada');
});

test('dlq-replay falla con un mensaje claro si la cola no existe', { skip: !available }, async () => {
  await assert.rejects(replay({ url, queue: `no.existe.${randomUUID()}` }), /no existe/);
});
