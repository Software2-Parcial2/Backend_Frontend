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
  { name: 'citas', ...key('pk', 'sk'), gsis: ['gsi1', 'gsi2', 'gsi3', 'gsi4'] },
  { name: 'idempotency_keys', ...key('pk'), ttl: 'expiresAt' },
  { name: 'outbox', ...key('pk'), stream: true },
  { name: 'processed_messages', ...key('pk'), ttl: 'expiresAt' },
  // --- MS8 (notificaciones) ---
  // gsi1: notificaciones PENDIENTES por proximo intento; gsi2: recordatorios pendientes por fecha de la cita. TTL: codigos de vinculo.
  { name: 'notificaciones', ...key('pk', 'sk'), gsis: ['gsi1', 'gsi2'], ttl: 'expiresAt' },
  { name: 'ms8_idempotency_keys', ...key('pk'), ttl: 'expiresAt' },
  { name: 'ms8_outbox', ...key('pk'), stream: true },
  { name: 'ms8_processed_messages', ...key('pk'), ttl: 'expiresAt' },
];

/**
 * Indices de la tabla `citas` (todos se alimentan desde el item CITA#<id>/CITA):
 *  gsi1  SAGA#ACTIVA / NOTIF#PENDIENTE por plazo (disperso)        gsi1sk = epoch ms
 *  gsi2  PACIENTE#<id>  por fecha de creacion                      gsi2sk = epoch ms
 *  gsi3  MEDICO#<id>    por fecha/hora de la cita                  gsi3sk = epoch ms
 *  gsi4  CITA (todas)   por fecha de creacion (listado general)    gsi4sk = epoch ms
 */
const GSIS = ['gsi1', 'gsi2', 'gsi3', 'gsi4'].map((n) => ({
  name: n,
  attrs: [
    { AttributeName: `${n}pk`, AttributeType: 'S' },
    { AttributeName: `${n}sk`, AttributeType: 'N' },
  ],
  def: {
    IndexName: n,
    KeySchema: [
      { AttributeName: `${n}pk`, KeyType: 'HASH' },
      { AttributeName: `${n}sk`, KeyType: 'RANGE' },
    ],
    Projection: { ProjectionType: n === 'gsi1' ? 'KEYS_ONLY' : 'ALL' },
  },
}));
const ALL_GSI_ATTRS = GSIS.flatMap((g) => g.attrs);

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
        AttributeDefinitions: t.gsis ? [...t.AttributeDefinitions, ...GSIS.filter((g) => t.gsis.includes(g.name)).flatMap((g) => g.attrs)] : t.AttributeDefinitions,
        KeySchema: t.KeySchema,
        ...(t.gsis ? { GlobalSecondaryIndexes: GSIS.filter((g) => t.gsis.includes(g.name)).map((g) => g.def) } : {}),
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
  if (t.gsis && table) {
    for (const g of GSIS.filter((x) => t.gsis.includes(x.name))) {
      if ((table.GlobalSecondaryIndexes ?? []).some((x) => x.IndexName === g.name)) continue;
      await client.send(
        new UpdateTableCommand({
          TableName: t.name,
          AttributeDefinitions: [...t.AttributeDefinitions, ...g.attrs],
          GlobalSecondaryIndexUpdates: [{ Create: g.def }],
        }),
      );
      action += ` indice ${g.name} creado;`;
      // DynamoDB solo permite crear un indice a la vez: se espera a que quede ACTIVE.
      for (let i = 0; i < 60; i++) {
        const d = await describe(t.name);
        if (d?.TableStatus === 'ACTIVE' && (d.GlobalSecondaryIndexes ?? []).every((x) => x.IndexStatus === 'ACTIVE')) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
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

// Relleno de los indices gsi2..gsi4 en citas creadas antes de que existieran (idempotente).
{
  const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(client);
  let key;
  let n = 0;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: 'citas',
        FilterExpression: 'sk = :sk AND attribute_not_exists(gsi4pk)',
        ExpressionAttributeValues: { ':sk': 'CITA' },
        ExclusiveStartKey: key,
      }),
    );
    for (const c of page.Items ?? []) {
      await doc.send(
        new UpdateCommand({
          TableName: 'citas',
          Key: { pk: c.pk, sk: c.sk },
          UpdateExpression: 'SET gsi2pk = :a, gsi2sk = :b, gsi3pk = :c, gsi3sk = :d, gsi4pk = :e, gsi4sk = :b',
          ExpressionAttributeValues: {
            ':a': `PACIENTE#${c.input.pacienteId}`,
            ':b': c.createdAt,
            ':c': `MEDICO#${c.input.medicoId}`,
            ':d': Date.parse(c.input.fechaHora),
            ':e': 'CITA',
          },
        }),
      );
      n++;
    }
    key = page.LastEvaluatedKey;
  } while (key);
  if (n > 0) console.log(`citas                    ${n} citas antiguas indexadas`);
}
