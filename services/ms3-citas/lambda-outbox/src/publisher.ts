import { unmarshall } from '@aws-sdk/util-dynamodb';

/** Publica un mensaje ya serializado. Debe resolver solo cuando el broker confirma (publisher confirms). */
export interface RecordPublisher {
  publish(exchange: string, routingKey: string, body: string, messageId: string): Promise<void>;
}

/** Forma comun de un registro de DynamoDB Streams (evento de Lambda o respuesta de GetRecords). */
export interface StreamRecord {
  eventName?: string;
  dynamodb?: {
    SequenceNumber?: string;
    NewImage?: Record<string, never> | Record<string, unknown>;
  };
}

export interface BatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

/** Item del outbox (lo escribe buildOutboxItem de @sigec/messaging-nest dentro de un TransactWriteItems). */
interface OutboxItem {
  pk: string;
  exchange: string;
  routingKey: string;
  envelope: string; // sobre serializado
}

/**
 * UNICA implementacion de la publicacion del outbox de DynamoDB: la usan el handler de Lambda (AWS) y el
 * poller local (DynamoDB Local no dispara Lambdas).
 *
 * - Solo procesa INSERT (las marcas/borrados del propio outbox no se republican).
 * - Respeta el orden; ante el primer fallo devuelve ese registro y TODOS los siguientes en `batchItemFailures`
 *   (informe parcial de lotes de Lambda: se reintenta desde el primero que fallo).
 * - Al menos una vez: el sobre conserva su `id`, asi el consumidor deduplica.
 */
export async function publishRecords(records: StreamRecord[], publisher: RecordPublisher): Promise<BatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  let failed = false;
  for (const record of records) {
    const sequence = record.dynamodb?.SequenceNumber ?? '';
    if (failed) {
      failures.push({ itemIdentifier: sequence });
      continue;
    }
    if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) continue;
    try {
      const item = unmarshall(record.dynamodb.NewImage as never) as unknown as OutboxItem;
      const envelope = JSON.parse(item.envelope) as { id?: string };
      await publisher.publish(item.exchange, item.routingKey, item.envelope, envelope.id ?? item.pk);
    } catch (error) {
      console.error(`outbox: fallo al publicar el registro ${sequence}: ${(error as Error).message}`);
      failed = true;
      failures.push({ itemIdentifier: sequence });
    }
  }
  return { batchItemFailures: failures };
}
