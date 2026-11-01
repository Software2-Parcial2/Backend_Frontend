import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, type DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { IdempotencyRecord, IdempotencyStore, ReserveResult, StoredResponse } from './types.js';

/**
 * Almacen en DynamoDB. pk = clave acotada por usuario. `expiresAt` (epoch en SEGUNDOS) es el atributo TTL de la tabla;
 * como el TTL de DynamoDB puede tardar hasta 48 h, la expiracion tambien se comprueba en la condicion de la reserva.
 */
export class DynamoIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async reserve(key: string, requestHash: string, now: number, expiresAt: number): Promise<ReserveResult> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: key,
            requestHash,
            status: 'PROCESANDO',
            createdAt: now,
            expiresAt: Math.ceil(expiresAt / 1000),
          },
          ConditionExpression: 'attribute_not_exists(pk) OR expiresAt < :nowSec',
          ExpressionAttributeValues: { ':nowSec': Math.floor(now / 1000) },
        }),
      );
      return { reserved: true };
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
    }
    const got = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: key }, ConsistentRead: true }));
    if (!got.Item) return this.reserve(key, requestHash, now, expiresAt); // se libero entre medias
    const i = got.Item;
    return {
      reserved: false,
      existing: {
        key,
        requestHash: i.requestHash,
        status: i.status,
        response: i.response as StoredResponse | undefined,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt * 1000,
      } satisfies IdempotencyRecord,
    };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: key },
        UpdateExpression: 'SET #s = :c, #r = :r',
        ExpressionAttributeNames: { '#s': 'status', '#r': 'response' }, // 'response' es palabra reservada
        ExpressionAttributeValues: { ':c': 'COMPLETADO', ':r': response },
      }),
    );
  }

  async release(key: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: key } }));
  }
}
