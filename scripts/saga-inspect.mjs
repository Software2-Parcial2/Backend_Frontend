#!/usr/bin/env node
// Inspector de la SAGA en DynamoDB.  node scripts/saga-inspect.mjs horario <medicoId> <fechaHoraISO>
// Imprime el estado EFECTIVO del horario (LIBRE | RESERVADO | CONFIRMADO; una reserva vencida cuenta como LIBRE).
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const [cmd, medicoId, fechaHora] = process.argv.slice(2);
if (cmd !== 'horario' || !medicoId || !fechaHora) {
  console.error('uso: saga-inspect.mjs horario <medicoId> <fechaHoraISO>');
  process.exit(2);
}
const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  region: 'sa-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const res = await client.send(
  new GetItemCommand({
    TableName: process.env.CITAS_TABLE ?? 'citas',
    Key: { pk: { S: `HORARIO#${medicoId}` }, sk: { S: new Date(fechaHora).toISOString() } },
    ConsistentRead: true,
  }),
);
const item = res.Item;
const estado = item?.estado?.S ?? 'LIBRE';
const expira = Number(item?.reservaExpiraEn?.N ?? 0);
const efectivo = estado === 'RESERVADO' && expira < Date.now() ? 'LIBRE' : estado;
console.log(efectivo);
