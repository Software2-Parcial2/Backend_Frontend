import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createEnvelope } from '@sigec/messaging-nest';
import {
  ConcurrentUpdateError,
  HorarioNoDisponibleError,
  HorarioPerdidoError,
  type CitaAggregate,
  type OutboxMessage,
} from '../../domain/cita.js';
import { aplicar, iniciar } from '../../application/saga/saga-machine.js';
import { DEFAULT_POLICY } from '../../application/saga/saga-policy.js';
import { DynamoCitaRepository } from './dynamo-cita.repository.js';

// Integracion contra DynamoDB Local (docker compose up -d). Se omite si no responde.
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const raw = new DynamoDBClient({ endpoint, region: 'sa-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const suffix = randomUUID().slice(0, 8);
const tables = { citas: `test_citas_${suffix}`, outbox: `test_outbox_${suffix}` };

const available = await (async () => {
  try {
    await raw.send(
      new CreateTableCommand({
        TableName: tables.citas,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'gsi1pk', AttributeType: 'S' },
          { AttributeName: 'gsi1sk', AttributeType: 'N' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'gsi1',
            KeySchema: [
              { AttributeName: 'gsi1pk', KeyType: 'HASH' },
              { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    await raw.send(
      new CreateTableCommand({
        TableName: tables.outbox,
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    return true;
  } catch {
    return false;
  }
})();

const T0 = Date.UTC(2026, 11, 1, 8, 0, 0);
const policy = { ...DEFAULT_POLICY, jitterRatio: 0 };
const medico = () => randomUUID();
const fecha = (h = 2) => new Date(T0 + h * 3600_000).toISOString();
const input = (medicoId: string, fechaHora = fecha()) => ({ pacienteId: randomUUID(), medicoId, especialidad: 'general', fechaHora });
const deps = (now: number) => ({ now, policy, random: () => 0, newId: () => randomUUID() });
const msgs = (agg: CitaAggregate, types: string[]): OutboxMessage[] =>
  types.map((type) => ({ id: randomUUID(), exchange: 'sigec.saga', type, correlationId: agg.saga.sagaId, causationId: null, payload: { citaId: agg.citaId } }));

describe.skipIf(!available)('DynamoCitaRepository (DynamoDB Local)', () => {
  let now = T0;
  const repo = new DynamoCitaRepository(doc, tables, () => now);
  beforeEach(() => {
    now = T0;
  });
  afterAll(async () => {
    await raw.send(new DeleteTableCommand({ TableName: tables.citas })).catch(() => undefined);
    await raw.send(new DeleteTableCommand({ TableName: tables.outbox })).catch(() => undefined);
  });

  const outboxCount = async () => (await doc.send(new ScanCommand({ TableName: tables.outbox }))).Count ?? 0;

  async function crear(medicoId = medico(), fechaHora = fecha()) {
    const t = iniciar(input(medicoId, fechaHora), deps(now));
    await repo.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: msgs(t.aggregate, t.commands.map((c) => c.type)) });
    return t.aggregate;
  }

  it('crea la cita, reserva el horario y escribe el outbox en una sola transaccion', async () => {
    const before = await outboxCount();
    const a = await crear();
    const cargada = (await repo.cargar(a.citaId))!;
    expect(cargada).toMatchObject({ citaId: a.citaId, estado: 'RESERVADA', version: 0 });
    expect(cargada.saga.sagaId).toBe(a.saga.sagaId);
    expect(await outboxCount()).toBe(before + 1);
  });

  it('impide la doble reserva del mismo horario y no deja nada a medias (ni cita ni outbox)', async () => {
    const m = medico();
    await crear(m);
    const before = await outboxCount();
    const t = iniciar(input(m), deps(now));
    await expect(
      repo.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: msgs(t.aggregate, ['x.y']) }),
    ).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    expect(await repo.cargar(t.aggregate.citaId)).toBeNull();
    expect(await outboxCount()).toBe(before);
  });

  it('de 8 reservas simultaneas del mismo horario solo una gana', async () => {
    const m = medico();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => crear(m)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof HorarioNoDisponibleError)).toHaveLength(7);
  });

  it('una reserva vencida se puede volver a reservar sin esperar al TTL de DynamoDB', async () => {
    const m = medico();
    await crear(m);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 1;
    await expect(crear(m)).resolves.toBeDefined();
  });

  it('CONFIRMAR deja el horario CONFIRMADO; si la reserva ya no es nuestra lanza HorarioPerdidoError', async () => {
    const m = medico();
    const a = await crear(m);
    const reg = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await repo.aplicar({ aggregate: reg.aggregate, expectedVersion: 0, horarioOps: reg.horarioOps, messages: [] });
    expect((await repo.cargar(a.citaId))!.version).toBe(1);

    // otra cita toma el horario cuando la primera ya expiro... pero la primera esta CONFIRMADA: no se puede
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 1;
    await expect(crear(m)).rejects.toBeInstanceOf(HorarioNoDisponibleError);

    // caso de reserva perdida: B reserva otro horario, expira, C lo toma, y B intenta confirmar
    now = T0;
    const m2 = medico();
    const b = await crear(m2);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 10;
    await crear(m2); // C
    const regB = aplicar(b, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await expect(repo.aplicar({ aggregate: regB.aggregate, expectedVersion: 0, horarioOps: regB.horarioOps, messages: [] })).rejects.toBeInstanceOf(HorarioPerdidoError);
  });

  it('LIBERAR libera el horario propio y se ignora si ya es de otra cita', async () => {
    const m = medico();
    const a = await crear(m);
    const rech = aplicar(a, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: rech.aggregate, expectedVersion: 0, horarioOps: rech.horarioOps, messages: [] });
    await expect(crear(m)).resolves.toBeDefined(); // volvio a estar libre

    // liberar un horario que ya no es nuestro no falla ni toca el de la otra cita
    const m2 = medico();
    const b = await crear(m2);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 10;
    await crear(m2); // C ocupa el horario de B
    const rechB = aplicar(b, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await expect(repo.aplicar({ aggregate: rechB.aggregate, expectedVersion: 0, horarioOps: rechB.horarioOps, messages: [] })).resolves.toBeUndefined();
    expect((await repo.cargar(b.citaId))!.estado).toBe('CANCELADA');
    await expect(crear(m2)).rejects.toBeInstanceOf(HorarioNoDisponibleError); // el de C sigue ocupado
  });

  it('el control de version optimista rechaza una escritura obsoleta', async () => {
    const a = await crear();
    const t = aplicar(a, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: t.aggregate, expectedVersion: 0, horarioOps: [], messages: [] });
    await expect(repo.aplicar({ aggregate: t.aggregate, expectedVersion: 0, horarioOps: [], messages: [] })).rejects.toBeInstanceOf(ConcurrentUpdateError);
  });

  it('el indice disperso devuelve SAGAs vencidas y notificaciones pendientes', async () => {
    const a = await crear();
    expect(await repo.sagasVencidas(T0 + DEFAULT_POLICY.stepTimeoutMs - 1000)).not.toContain(a.citaId);
    expect(await repo.sagasVencidas(T0 + DEFAULT_POLICY.stepTimeoutMs)).toContain(a.citaId);

    const conCobro = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await repo.aplicar({ aggregate: conCobro.aggregate, expectedVersion: 0, horarioOps: conCobro.horarioOps, messages: [] });
    const fallida = aplicar(conCobro.aggregate, { type: 'NOTIFICACION_FALLIDA', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: fallida.aggregate, expectedVersion: 1, horarioOps: [], messages: [] });

    expect(await repo.sagasVencidas(T0 + 10 * 3600_000)).not.toContain(a.citaId); // ya no es una SAGA activa
    expect(await repo.notificacionesPendientes(T0 + DEFAULT_POLICY.notificacionReintentoMs)).toContain(a.citaId);
    expect(await repo.notificacionesPendientes(T0)).not.toContain(a.citaId);
  });

  it('el envelope del outbox cumple el sobre comun', async () => {
    const a = await crear();
    const items = (await doc.send(new QueryCommand({ TableName: tables.outbox, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': (await doc.send(new ScanCommand({ TableName: tables.outbox, Limit: 1 }))).Items![0].pk } }))).Items!;
    const env = JSON.parse(items[0].envelope);
    expect(createEnvelope({ type: 'a.b', correlationId: randomUUID(), payload: {} })).toBeDefined();
    expect(env).toMatchObject({ version: 1, causationId: null });
    expect(a).toBeDefined();
  });
});
