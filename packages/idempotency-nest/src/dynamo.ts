import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** Cliente DynamoDB desde el entorno (DYNAMODB_ENDPOINT apunta a DynamoDB Local en desarrollo). */
export function createDocClient(env: NodeJS.ProcessEnv = process.env): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: env.AWS_REGION ?? 'sa-east-1',
    ...(env.DYNAMODB_ENDPOINT
      ? {
          endpoint: env.DYNAMODB_ENDPOINT,
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID ?? 'local',
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? 'local',
          },
        }
      : {}),
  });
  return DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
}
