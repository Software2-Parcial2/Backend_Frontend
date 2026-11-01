import {
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  GetRecordsCommand,
  GetShardIteratorCommand,
} from '@aws-sdk/client-dynamodb-streams';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AmqpPublisher, rabbitUrlFromEnv } from './amqp.ts';
import { publishRecords, type RecordPublisher, type StreamRecord } from './publisher.ts';

type Checkpoints = Record<string, string>; // shardId -> ultimo SequenceNumber publicado

export interface PollerOptions {
  endpoint?: string;
  region?: string;
  tableName: string;
  publisher: RecordPublisher;
  /** Archivo donde se guarda el punto de lectura por shard. */
  checkpointFile: string;
}

/**
 * SOLO DESARROLLO LOCAL. DynamoDB Local no dispara Lambdas, asi que este poller lee el stream de la tabla outbox y
 * llama a la MISMA funcion (publishRecords) que el handler de AWS. Diferencias con AWS:
 *  - AWS: Lambda + event source mapping gestionan shards, orden, reintentos y checkpoint (batchItemFailures).
 *  - Local: el checkpoint es un archivo; la lectura es por sondeo; un registro que falla se reintenta en el siguiente ciclo.
 */
export class OutboxPoller {
  private readonly streams: DynamoDBStreamsClient;
  private readonly dynamo: DynamoDBClient;
  private streamArn?: string;

  constructor(private readonly o: PollerOptions) {
    const config = {
      endpoint: o.endpoint,
      region: o.region ?? 'sa-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    };
    this.streams = new DynamoDBStreamsClient(config);
    this.dynamo = new DynamoDBClient(config);
  }

  private loadCheckpoints(): Checkpoints {
    return existsSync(this.o.checkpointFile) ? (JSON.parse(readFileSync(this.o.checkpointFile, 'utf8')) as Checkpoints) : {};
  }

  private saveCheckpoints(c: Checkpoints) {
    writeFileSync(this.o.checkpointFile, JSON.stringify(c, null, 2));
  }

  private async resolveStream(): Promise<string> {
    if (!this.streamArn) {
      const t = await this.dynamo.send(new DescribeTableCommand({ TableName: this.o.tableName }));
      if (!t.Table?.LatestStreamArn) throw new Error(`La tabla ${this.o.tableName} no tiene stream activado`);
      this.streamArn = t.Table.LatestStreamArn;
    }
    return this.streamArn;
  }

  /** Una pasada por todos los shards. Devuelve cuantos registros se publicaron. */
  async pollOnce(): Promise<number> {
    const arn = await this.resolveStream();
    const checkpoints = this.loadCheckpoints();
    const desc = await this.streams.send(new DescribeStreamCommand({ StreamArn: arn }));
    let published = 0;
    for (const shard of desc.StreamDescription?.Shards ?? []) {
      const shardId = shard.ShardId!;
      const last = checkpoints[shardId];
      const iterator = await this.streams.send(
        new GetShardIteratorCommand({
          StreamArn: arn,
          ShardId: shardId,
          ...(last
            ? { ShardIteratorType: 'AFTER_SEQUENCE_NUMBER', SequenceNumber: last }
            : { ShardIteratorType: 'TRIM_HORIZON' }),
        }),
      );
      let next = iterator.ShardIterator;
      while (next) {
        const page = await this.streams.send(new GetRecordsCommand({ ShardIterator: next, Limit: 100 }));
        const records = (page.Records ?? []) as unknown as StreamRecord[];
        if (records.length > 0) {
          const result = await publishRecords(records, this.o.publisher);
          const firstFailure = result.batchItemFailures[0]?.itemIdentifier;
          const okRecords = firstFailure
            ? records.slice(0, records.findIndex((r) => r.dynamodb?.SequenceNumber === firstFailure))
            : records;
          published += okRecords.filter((r) => r.eventName === 'INSERT').length;
          const lastOk = okRecords.at(-1)?.dynamodb?.SequenceNumber;
          if (lastOk) {
            checkpoints[shardId] = lastOk;
            this.saveCheckpoints(checkpoints);
          }
          if (firstFailure) throw new Error(`fallo al publicar desde el registro ${firstFailure}`);
        }
        next = page.NextShardIterator && records.length > 0 ? page.NextShardIterator : undefined;
      }
    }
    return published;
  }
}

// --- ejecucion como proceso: node dist/poller.cjs ---
const isMain = process.argv[1]?.endsWith('poller.cjs') || process.argv[1]?.endsWith('poller.ts');
if (isMain) {
  const tables = (process.env.OUTBOX_TABLES ?? 'outbox,ms8_outbox').split(',').map((t) => t.trim());
  const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
  const publisher = new AmqpPublisher(rabbitUrlFromEnv());
  const pollers = tables.map(
    (tableName) =>
      new OutboxPoller({
        endpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
        tableName,
        publisher,
        checkpointFile: `${process.env.OUTBOX_CHECKPOINT_DIR ?? '/tmp'}/sigec-outbox-checkpoint-${tableName}.json`,
      }),
  );
  console.log(`outbox-poller: tablas=${tables.join(',')} intervalo=${intervalMs}ms`);
  let failures = 0;
  const loop = async () => {
    for (;;) {
      try {
        for (const p of pollers) {
          const n = await p.pollOnce();
          if (n > 0) console.log(`outbox-poller: publicados=${n}`);
        }
        failures = 0;
        await new Promise((r) => setTimeout(r, intervalMs));
      } catch (e) {
        failures++;
        const backoff = Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5));
        console.warn(`outbox-poller: ${(e as Error).message}; reintento en ${backoff} ms [fallos seguidos=${failures}]`);
        await publisher.close();
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  };
  void loop();
}
