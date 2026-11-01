#!/usr/bin/env node
// Crea (de forma repetible) las tablas de DynamoDB Local de MS3 y MS8.
// Uso: make dynamodb-init   |   DYNAMODB_ENDPOINT=http://localhost:8000 node scripts/dynamodb-init.mjs
import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  region: process.env.AWS_REGION ?? 'sa-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
  },
});

const S = 'S';
const key = (pk, sk) => ({
  AttributeDefinitions: [
    { AttributeName: pk, AttributeType: S },
    ...(sk ? [{ AttributeName: sk, AttributeType: S }] : []),
  ],
  KeySchema: [
    { AttributeName: pk, KeyType: 'HASH' },
    ...(sk ? [{ AttributeName: sk, KeyType: 'RANGE' }] : []),
  ],
});

/**
 * Tablas por servicio. `ttl` = atributo con epoch en segundos; `stream` = DynamoDB Streams activado (tablas outbox).
 * MS3 y MS8 comparten la misma instancia de DynamoDB Local (y la misma cuenta en AWS), asi que los nombres que
 * coincidirian (idempotency_keys, outbox, processed_messages) llevan el prefijo `ms8_` en MS8. Los nombres reales
 * se leen de variables de entorno en cada servicio (IDEMPOTENCY_TABLE, OUTBOX_TABLE, PROCESSED_TABLE).
 */
const tables = [
  // --- MS3 (citas / orquestador de la SAGA) ---
  // gsi1 (disperso): SAGAs en curso por plazo y notificaciones pendientes por proximo intento.
  { name: 'citas', ...key('pk', 'sk'), gsi1: true },
  { name: 'idempotency_keys', ...key('pk'), ttl: 'expiresAt' },
  { name: 'outbox', ...key('pk'), stream: true },
  { name: 'processed_messages', ...key('pk'), ttl: 'expiresAt' },
  // --- MS8 (notificaciones) ---
  { name: 'notificaciones', ...key('pk', 'sk') },
  { name: 'ms8_idempotency_keys', ...key('pk'), ttl: 'expiresAt' },
  { name: 'ms8_outbox', ...key('pk'), stream: true },
  { name: 'ms8_processed_messages', ...key('pk'), ttl: 'expiresAt' },
];

const GSI1 = {
  IndexName: 'gsi1',
  KeySchema: [
    { AttributeName: 'gsi1pk', KeyType: 'HASH' },
    { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
  ],
  Projection: { ProjectionType: 'KEYS_ONLY' },
};
const GSI1_ATTRS = [
  { AttributeName: 'gsi1pk', AttributeType: 'S' },
  { AttributeName: 'gsi1sk', AttributeType: 'N' },
];

async function describe(name) {
  try {
    return (await client.send(new DescribeTableCommand({ TableName: name }))).Table;
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') return null;
    throw e;
  }
}

for (const t of tables) {
  let table = await describe(t.name);
  let action = 'ya existe';
  if (!table) {
    await client.send(
      new CreateTableCommand({
        TableName: t.name,
        AttributeDefinitions: t.gsi1 ? [...t.AttributeDefinitions, ...GSI1_ATTRS] : t.AttributeDefinitions,
        KeySchema: t.KeySchema,
        ...(t.gsi1 ? { GlobalSecondaryIndexes: [GSI1] } : {}),
        BillingMode: 'PAY_PER_REQUEST',
        ...(t.stream ? { StreamSpecification: { StreamEnabled: true, StreamViewType: 'NEW_IMAGE' } } : {}),
      }),
    );
    action = 'creada';
  } else if (t.stream && !table.StreamSpecification?.StreamEnabled) {
    await client.send(
      new UpdateTableCommand({
        TableName: t.name,
        StreamSpecification: { StreamEnabled: true, StreamViewType: 'NEW_IMAGE' },
      }),
    );
    action = 'stream activado';
  }
  if (t.gsi1 && table && !(table.GlobalSecondaryIndexes ?? []).some((g) => g.IndexName === 'gsi1')) {
    await client.send(
      new UpdateTableCommand({
        TableName: t.name,
        AttributeDefinitions: [...t.AttributeDefinitions, ...GSI1_ATTRS],
        GlobalSecondaryIndexUpdates: [{ Create: GSI1 }],
      }),
    );
    action = 'indice gsi1 creado';
  }
  if (t.ttl) {
    const ttl = (await client.send(new DescribeTimeToLiveCommand({ TableName: t.name }))).TimeToLiveDescription;
    if (ttl?.TimeToLiveStatus !== 'ENABLED' && ttl?.TimeToLiveStatus !== 'ENABLING') {
      await client.send(
        new UpdateTimeToLiveCommand({
          TableName: t.name,
          TimeToLiveSpecification: { Enabled: true, AttributeName: t.ttl },
        }),
      );
      action += ' + TTL';
    }
  }
  console.log(`${t.name.padEnd(24)} ${action}`);
}
