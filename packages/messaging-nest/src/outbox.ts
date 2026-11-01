import type { Envelope } from './envelope.js';
import { validateMessage } from './schema-validator.js';
import { EXCHANGE_EVENTOS } from './topology.js';

/** Elemento `Put` listo para incluir en un TransactWriteItems (lib-dynamodb `TransactWriteCommand`). */
export interface OutboxPutItem {
  Put: {
    TableName: string;
    Item: { pk: string; exchange: string; routingKey: string; envelope: string; createdAt: string };
    ConditionExpression: string;
  };
}

/**
 * Patron Outbox sobre DynamoDB (MS3 / MS8): el evento se escribe en la MISMA transaccion que el cambio de negocio.
 *
 *   await doc.send(new TransactWriteCommand({ TransactItems: [
 *     { Put: { TableName: 'citas', Item: cita } },
 *     buildOutboxItem('outbox', envelope),           // <- atomico con el cambio de negocio
 *   ]}));
 *
 * Un DynamoDB Stream de la tabla outbox dispara services/ms3-citas/lambda-outbox (AWS) o su poller (local), que
 * publica el sobre en RabbitMQ al menos una vez. `pk` = id del sobre => los consumidores deduplican por id.
 */
export function buildOutboxItem(tableName: string, envelope: Envelope, exchange: string = EXCHANGE_EVENTOS): OutboxPutItem {
  validateMessage(envelope);
  return {
    Put: {
      TableName: tableName,
      Item: {
        pk: envelope.id,
        exchange,
        routingKey: envelope.type,
        envelope: JSON.stringify(envelope),
        createdAt: envelope.occurredAt,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    },
  };
}
