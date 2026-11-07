#!/usr/bin/env node
// Declara TODA la topologia de contracts/events/topology.json (idempotente).
// Uso: make rabbitmq-declare
import amqp from 'amqplib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const topology = JSON.parse(
  readFileSync(fileURLToPath(new URL('../contracts/events/topology.json', import.meta.url)), 'utf8'),
);
const url =
  process.env.RABBITMQ_URL ??
  `amqp://${encodeURIComponent(process.env.RABBITMQ_USER ?? 'sigec')}:${encodeURIComponent(process.env.RABBITMQ_PASSWORD ?? 'cambia_esto')}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;

const conn = await amqp.connect(url);
const ch = await conn.createChannel();
const { retry } = topology;

for (const ex of topology.exchanges) await ch.assertExchange(ex.name, ex.type, { durable: ex.durable });

for (const q of topology.queues) {
  await ch.assertQueue(q.name, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': retry.deadLetterExchange, 'x-dead-letter-routing-key': `${q.name}.dlq` },
  });
  for (const b of q.bindings) for (const rk of b.routingKeys) await ch.bindQueue(q.name, b.exchange, rk);

  await ch.assertQueue(`${q.name}.dlq`, { durable: true });
  await ch.bindQueue(`${q.name}.dlq`, retry.deadLetterExchange, `${q.name}.dlq`);

  for (const tier of retry.tiers) {
    const name = `${q.name}.${tier.suffix}`;
    await ch.assertQueue(name, {
      durable: true,
      arguments: { 'x-message-ttl': tier.ttlMs, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': q.name },
    });
    await ch.bindQueue(name, retry.exchange, name);
  }
  console.log(`cola ${q.name} (+ dlq y ${retry.tiers.length} colas de espera)`);
}
await conn.close();
