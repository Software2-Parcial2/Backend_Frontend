import type { ConfirmChannel } from 'amqplib';
import { TOPOLOGY } from './topology.generated.js';

export { TOPOLOGY };

export const EXCHANGE_SAGA = 'sigec.saga';
export const EXCHANGE_EVENTOS = 'sigec.eventos';
export const EXCHANGE_RETRY = TOPOLOGY.retry.exchange;
export const EXCHANGE_DLX = TOPOLOGY.retry.deadLetterExchange;

export interface QueueSpec {
  name: string;
  bindings: readonly { exchange: string; routingKeys: readonly string[] }[];
}

export interface RetryTier {
  suffix: string;
  ttlMs: number;
}

/** Declara los cuatro exchanges (idempotente). */
export async function declareExchanges(ch: ConfirmChannel): Promise<void> {
  for (const ex of TOPOLOGY.exchanges) await ch.assertExchange(ex.name, ex.type, { durable: ex.durable });
}

/**
 * Declara una cola de consumo con su DLQ y sus colas de espera (idempotente).
 * `tiers` solo se cambia en pruebas (TTL cortos); en produccion se usa TOPOLOGY.retry.tiers.
 */
export async function declareConsumerQueue(
  ch: ConfirmChannel,
  spec: QueueSpec,
  tiers: readonly RetryTier[] = TOPOLOGY.retry.tiers,
): Promise<void> {
  await declareExchanges(ch);
  await ch.assertQueue(spec.name, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': EXCHANGE_DLX, 'x-dead-letter-routing-key': `${spec.name}.dlq` },
  });
  for (const b of spec.bindings) for (const rk of b.routingKeys) await ch.bindQueue(spec.name, b.exchange, rk);

  await ch.assertQueue(`${spec.name}.dlq`, { durable: true });
  await ch.bindQueue(`${spec.name}.dlq`, EXCHANGE_DLX, `${spec.name}.dlq`);

  for (const tier of tiers) {
    const name = `${spec.name}.${tier.suffix}`;
    await ch.assertQueue(name, {
      durable: true,
      arguments: { 'x-message-ttl': tier.ttlMs, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': spec.name },
    });
    await ch.bindQueue(name, EXCHANGE_RETRY, name);
  }
}

/** Especificacion de una cola de la topologia oficial por nombre (p. ej. "ms6.saga.comandos"). */
export function queueSpec(name: string): QueueSpec {
  const q = TOPOLOGY.queues.find((x) => x.name === name);
  if (!q) throw new Error(`Cola desconocida en topology.json: ${name}`);
  return q;
}
