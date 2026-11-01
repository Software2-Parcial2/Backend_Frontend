import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, type DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/** Estructuralmente igual a MessageDeduplicator de @sigec/messaging-nest. */
export interface MessageDeduplicator {
  tryBegin(messageId: string): Promise<boolean>;
  complete(messageId: string): Promise<void>;
  release(messageId: string): Promise<void>;
}

export class MessageInProgressError extends Error {
  constructor(id: string) {
    super(`El mensaje ${id} esta siendo procesado por otro consumidor`);
  }
}

const LEASE_SECONDS = 60;
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

/**
 * Deduplicacion de consumidores por `id` del mensaje (tabla processed_messages, TTL en `expiresAt`).
 * tryBegin: true = ejecutar; false = ya COMPLETADO (descartar). Si otro consumidor lo tiene PROCESANDO dentro
 * del arrendamiento lanza MessageInProgressError (el mensaje se reintenta mas tarde, sin perderlo).
 */
export class DynamoMessageDeduplicator implements MessageDeduplicator {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => number = Date.now,
  ) {}

  async tryBegin(id: string): Promise<boolean> {
    const nowSec = Math.floor(this.now() / 1000);
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk: id, status: 'PROCESANDO', lockedUntil: nowSec + LEASE_SECONDS, expiresAt: nowSec + RETENTION_SECONDS },
          ConditionExpression: 'attribute_not_exists(pk) OR (#s = :proc AND lockedUntil < :now) OR expiresAt < :now',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':proc': 'PROCESANDO', ':now': nowSec },
        }),
      );
      return true;
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
    }
    // Existe y esta vigente: COMPLETADO -> duplicado; PROCESANDO vigente -> otro consumidor lo tiene.
    const done = await this.doc
      .send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: id },
          UpdateExpression: 'SET #s = #s',
          ConditionExpression: '#s = :done',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':done': 'COMPLETADO' },
        }),
      )
      .then(() => true)
      .catch((e) => (e instanceof ConditionalCheckFailedException ? false : Promise.reject(e)));
    if (done) return false;
    throw new MessageInProgressError(id);
  }

  async complete(id: string): Promise<void> {
    const nowSec = Math.floor(this.now() / 1000);
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: id },
        UpdateExpression: 'SET #s = :done, expiresAt = :exp REMOVE lockedUntil',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':done': 'COMPLETADO', ':exp': nowSec + RETENTION_SECONDS },
      }),
    );
  }

  async release(id: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: id } }));
  }
}
