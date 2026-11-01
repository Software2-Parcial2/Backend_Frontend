#!/usr/bin/env node
// Reprocesa mensajes de una DLQ: los mueve de <cola>.dlq a <cola> (la cola original) CONSERVANDO el cuerpo y el message_id,
// asi el id del sobre no cambia y la deduplicacion de los consumidores sigue funcionando. Se reinicia el contador de reintentos.
//
//   make dlq-replay QUEUE=ms6.saga.comandos [LIMIT=10]        (acepta tambien QUEUE=ms6.saga.comandos.dlq)
//   node scripts/dlq-replay.mjs ms6.saga.comandos 10
//
// Cada mensaje se publica con confirmacion y SOLO entonces se hace ack en la DLQ: si falla, vuelve a la DLQ (no se pierde).
import amqp from 'amqplib';
import { fileURLToPath } from 'node:url';

export function defaultUrl(env = process.env) {
  return (
    env.RABBITMQ_URL ??
    `amqp://${encodeURIComponent(env.RABBITMQ_USER ?? 'sigec')}:${encodeURIComponent(env.RABBITMQ_PASSWORD ?? 'cambia_esto')}@${env.RABBITMQ_HOST ?? 'localhost'}:${env.RABBITMQ_PORT ?? '5672'}`
  );
}

/** @returns {Promise<{ moved: number, remaining: number, from: string, to: string }>} */
export async function replay({ url = defaultUrl(), queue, limit = Number.POSITIVE_INFINITY }) {
  if (!queue) throw new Error('Falta la cola (QUEUE=...)');
  const from = queue.endsWith('.dlq') ? queue : `${queue}.dlq`;
  const to = from.slice(0, -'.dlq'.length);
  const conn = await amqp.connect(url);
  try {
    conn.on('error', () => undefined);
    // checkQueue cierra el canal con 404 si la cola no existe: se comprueba en un canal descartable.
    for (const name of [from, to]) {
      const probe = await conn.createChannel();
      probe.on('error', () => undefined);
      await probe.checkQueue(name).catch(() => {
        throw new Error(`la cola ${name} no existe`);
      });
      await probe.close().catch(() => undefined);
    }
    const ch = await conn.createConfirmChannel();
    let moved = 0;
    while (moved < limit) {
      const msg = await ch.get(from, { noAck: false });
      if (!msg) break;
      const { 'x-retries': _r, 'x-last-error': lastError, ...headers } = msg.properties.headers ?? {};
      try {
        await new Promise((resolve, reject) => {
          // Exchange por defecto: va directo a la cola original, sin depender de los enlaces.
          ch.publish(
            '',
            to,
            msg.content,
            {
              persistent: true,
              contentType: msg.properties.contentType ?? 'application/json',
              messageId: msg.properties.messageId,
              type: msg.properties.type,
              correlationId: msg.properties.correlationId,
              timestamp: msg.properties.timestamp,
              headers: { ...headers, 'x-replayed-from': from, 'x-replayed-at': new Date().toISOString(), ...(lastError ? { 'x-previous-error': String(lastError).slice(0, 500) } : {}) },
            },
            (err) => (err ? reject(err) : resolve()),
          );
        });
      } catch (e) {
        ch.nack(msg, false, true);
        throw e;
      }
      ch.ack(msg);
      moved++;
    }
    const remaining = (await ch.checkQueue(from)).messageCount;
    return { moved, remaining, from, to };
  } finally {
    await conn.close().catch(() => undefined);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [queue, limit] = process.argv.slice(2);
  replay({ queue, limit: limit ? Number(limit) : Number.POSITIVE_INFINITY })
    .then((r) => console.log(`${r.moved} mensaje(s) movidos de ${r.from} a ${r.to}; quedan ${r.remaining} en la DLQ`))
    .catch((e) => {
      console.error(`dlq-replay: ${e.message}`);
      process.exit(1);
    });
}
