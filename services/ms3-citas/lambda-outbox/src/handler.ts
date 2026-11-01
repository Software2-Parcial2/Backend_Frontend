import type { DynamoDBBatchResponse, DynamoDBStreamHandler } from 'aws-lambda';
import { AmqpPublisher, rabbitUrlFromEnv } from './amqp.ts';
import { publishRecords, type StreamRecord } from './publisher.ts';

let publisher: AmqpPublisher | undefined;

/**
 * Handler de AWS Lambda para el DynamoDB Stream de la tabla outbox (ms3 / ms8).
 * Configuracion del origen de eventos: FunctionResponseTypes = ["ReportBatchItemFailures"], StartingPosition = TRIM_HORIZON,
 * BatchSize 100. Variables: RABBITMQ_URL (o RABBITMQ_HOST/USER/PASSWORD).
 */
export const handler: DynamoDBStreamHandler = async (event): Promise<DynamoDBBatchResponse> => {
  publisher ??= new AmqpPublisher(rabbitUrlFromEnv());
  const result = await publishRecords(event.Records as unknown as StreamRecord[], publisher);
  if (result.batchItemFailures.length > 0) {
    // Se descarta la conexion: el siguiente reintento abre una nueva.
    await publisher.close();
    publisher = undefined;
  }
  return result;
};
