import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import {
  createEnvelope,
  EXCHANGE_SAGA,
  RabbitConnection,
  RabbitConsumer,
  RabbitPublisher,
  rabbitUrlFromEnv,
  type QueueSpec,
} from '../src/index.js';

// Integracion contra el RabbitMQ real de docker compose. Se omite si no hay conexion o credenciales:
//   set -a; source .env; set +a; pnpm test
const url = rabbitUrlFromEnv();
const available = await amqp
  .connect(url)
  .then((c) => c.close().then(() => true))
  .catch(() => false);

const TIERS = [{ suffix: 'retry.t', ttlMs: 150 }];

describe.skipIf(!available)('RabbitMQ (integracion)', () => {
  const connection = new RabbitConnection({ url });
  const publisher = new RabbitPublisher(connection);
  const consumers: RabbitConsumer[] = [];
  const created: string[] = [];

  const newSpec = (): QueueSpec => {
    const name = `test.${randomUUID().slice(0, 8)}`;
    created.push(name);
    return { name, bindings: [{ exchange: EXCHANGE_SAGA, routingKeys: [`test.${name}`] }] };
  };
  const send = (spec: QueueSpec, payload: Record<string, unknown> = {}) => {
    const env = createEnvelope({ type: spec.bindings[0].routingKeys[0], correlationId: randomUUID(), payload });
    return publisher.publish(EXCHANGE_SAGA, env).then(() => env);
  };
  const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 8000) => {
    const t0 = Date.now();
    while (!(await cond())) {
      if (Date.now() - t0 > ms) throw new Error('timeout esperando condicion');
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const depth = async (queue: string) => {
    const c = await amqp.connect(url);
    const ch = await c.createChannel();
    const n = (await ch.checkQueue(queue)).messageCount;
    await c.close();
    return n;
  };

  afterAll(async () => {
    for (const c of consumers) await c.stop();
    const c = await amqp.connect(url);
    const ch = await c.createChannel();
    for (const q of created)
      for (const name of [q, `${q}.dlq`, ...TIERS.map((t) => `${q}.${t.suffix}`)]) await ch.deleteQueue(name).catch(() => undefined);
    await c.close();
    await connection.close();
  });

  it('entrega un mensaje con confirms y hace ack', async () => {
    const spec = newSpec();
    const received: string[] = [];
    const consumer = new RabbitConsumer(connection, { spec, tiers: TIERS, handler: async (e) => void received.push(e.id) });
    consumers.push(consumer);
    await consumer.start();
    const env = await send(spec, { hola: 1 });
    await waitFor(() => received.includes(env.id));
    await waitFor(async () => (await depth(spec.name)) === 0);
  });

  it('reintenta con la cola de espera y termina procesando', async () => {
    const spec = newSpec();
    const retriesSeen: number[] = [];
    const consumer = new RabbitConsumer(connection, {
      spec,
      tiers: TIERS,
      handler: async (_e, ctx) => {
        retriesSeen.push(ctx.retries);
        if (ctx.retries < 2) throw new Error('fallo transitorio');
      },
    });
    consumers.push(consumer);
    await consumer.start();
    await send(spec);
    await waitFor(() => retriesSeen.length === 3);
    expect(retriesSeen).toEqual([0, 1, 2]);
    expect(await depth(`${spec.name}.dlq`)).toBe(0);
  });

  it('manda a la DLQ tras agotar los reintentos', async () => {
    const spec = newSpec();
    let calls = 0;
    const consumer = new RabbitConsumer(connection, {
      spec,
      tiers: TIERS,
      maxRetries: 2,
      handler: async () => {
        calls++;
        throw new Error('siempre falla');
      },
    });
    consumers.push(consumer);
    await consumer.start();
    await send(spec);
    await waitFor(async () => (await depth(`${spec.name}.dlq`)) === 1);
    expect(calls).toBe(3); // entrega inicial + 2 reintentos
    expect(await depth(spec.name)).toBe(0);
  });

  it('manda directo a la DLQ un mensaje que no cumple el sobre', async () => {
    const spec = newSpec();
    let calls = 0;
    const consumer = new RabbitConsumer(connection, { spec, tiers: TIERS, handler: async () => void calls++ });
    consumers.push(consumer);
    await consumer.start();
    await publisher.publishRaw(EXCHANGE_SAGA, spec.bindings[0].routingKeys[0], Buffer.from('{"no":"es un sobre"}'));
    await waitFor(async () => (await depth(`${spec.name}.dlq`)) === 1);
    expect(calls).toBe(0);
  });

  it('un mensaje que viola el schema de su tipo va a la DLQ con el motivo', async () => {
    const spec = newSpec();
    let calls = 0;
    const consumer = new RabbitConsumer(connection, { spec, tiers: TIERS, handler: async () => void calls++ });
    consumers.push(consumer);
    await consumer.start();
    const malo = createEnvelope({ type: 'facturacion.cobro.anular', correlationId: randomUUID(), payload: { citaId: 'no-uuid' } });
    // Directo a la cola de prueba (exchange por defecto): jamas por sigec.saga, o llegaria a las colas reales de MS6.
    await publisher.publishRaw('', spec.name, Buffer.from(JSON.stringify(malo)));
    await waitFor(async () => (await depth(`${spec.name}.dlq`)) === 1);
    expect(calls).toBe(0);
    const c = await amqp.connect(url);
    const ch = await c.createChannel();
    const m = await ch.get(`${spec.name}.dlq`, { noAck: true });
    await c.close();
    expect(String(m && m.properties.headers?.['x-last-error'])).toMatch(/citaId.*uuid/);
  });

  it('el publicador rechaza un mensaje que viola el contrato antes de enviarlo', async () => {
    const malo = createEnvelope({ type: 'facturacion.cobro.anular', correlationId: randomUUID(), payload: { citaId: 'no-uuid', motivo: 'x' } });
    await expect(publisher.publish(EXCHANGE_SAGA, malo)).rejects.toThrow(/citaId/);
  });

  it('el publicador rechaza un sobre invalido antes de enviarlo', async () => {
    await expect(publisher.publish(EXCHANGE_SAGA, { id: 'x' } as never)).rejects.toThrow(/Sobre invalido/);
  });

  it('el deduplicador evita ejecutar dos veces el mismo id', async () => {
    const spec = newSpec();
    const seen = new Set<string>();
    let executions = 0;
    const consumer = new RabbitConsumer(connection, {
      spec,
      tiers: TIERS,
      deduplicator: {
        tryBegin: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
        release: async (id) => void seen.delete(id),
      },
      handler: async () => void executions++,
    });
    consumers.push(consumer);
    await consumer.start();
    const env = createEnvelope({ type: spec.bindings[0].routingKeys[0], correlationId: randomUUID(), payload: {} });
    await publisher.publish(EXCHANGE_SAGA, env);
    await publisher.publish(EXCHANGE_SAGA, env); // misma entrega repetida
    await waitFor(async () => (await depth(spec.name)) === 0 && executions >= 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(executions).toBe(1);
  });
});
