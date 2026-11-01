# Patron Outbox y relay

**Garantia:** el evento se escribe en la **misma transaccion** que el cambio de negocio y un relay lo publica **al menos una vez**
en RabbitMQ (publisher confirms). El `id` del sobre es el id de la fila/item del outbox, asi que una reentrega es identica y el
consumidor la descarta (dedupe por `id`, ver `contracts/idempotency.md`).

| Servicio | Tabla outbox | Relay |
|---|---|---|
| MS2, MS4 (Spring) | PostgreSQL `outbox` | `OutboxRelay` (`@Scheduled`, `sigec.outbox.interval-ms`=1000, `sigec.outbox.batch-size`=50) dentro del servicio |
| MS6 (Laravel) | PostgreSQL `outbox` | `php artisan outbox:relay` (`composer relay`; `composer workers` lo lanza junto al worker de la cola) |
| MS3, MS8 (Nest) | DynamoDB `outbox` / `ms8_outbox` (Streams `NEW_IMAGE`) | AWS: Lambda `lambda-outbox`. Local: poller |

## SQL (MS2, MS4, MS6)

`SELECT ... WHERE published_at IS NULL ORDER BY created_at LIMIT n FOR UPDATE SKIP LOCKED` en una transaccion; por cada fila publica
y espera la confirmacion del broker y entonces marca `published_at`. Si una publicacion falla se confirma lo ya publicado, se detiene el
lote (se conserva el orden) y se reintenta con backoff exponencial de 1 s a 30 s. Si el proceso muere entre publicar y marcar, el evento se
reenvia con el mismo `id`.

## DynamoDB (MS3, MS8)

El servicio escribe el cambio de negocio y el evento en una sola `TransactWriteItems`:

```ts
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
await doc.send(new TransactWriteCommand({ TransactItems: [
  { Put: { TableName: 'citas', Item: cita } },
  buildOutboxItem('outbox', createEnvelope({ type: 'cita.reservada', correlationId, payload })),   // exchange sigec.eventos
  // para comandos de la SAGA: buildOutboxItem('outbox', envelope, 'sigec.saga')
]}));
```

`services/ms3-citas/lambda-outbox/src/publisher.ts` (`publishRecords`) es la **unica** implementacion de la publicacion: solo procesa `INSERT`,
respeta el orden y devuelve `batchItemFailures` (el primer registro que fallo y todos los siguientes).

### AWS vs local

| | AWS | Local (DynamoDB Local) |
|---|---|---|
| Disparo | Lambda con event source mapping del Stream (`ReportBatchItemFailures`, `TRIM_HORIZON`, lote 100) | DynamoDB Local **no dispara Lambdas**: `poller.ts` sondea el Stream |
| Handler | `src/handler.ts` -> `dist/handler.cjs` (`npm run build`) | `src/poller.ts` -> `dist/poller.cjs` |
| Checkpoint y reintentos | Los gestiona Lambda | Archivo `/tmp/sigec-outbox-checkpoint-<tabla>.json`; un fallo se reintenta en el siguiente ciclo con backoff |
| Misma funcion de publicacion | `publishRecords` | `publishRecords` |

Uso local:

```bash
make dynamodb-init                       # tablas (incluye outbox y ms8_outbox con stream)
scripts/dev-services.sh poller-start     # OUTBOX_TABLES=outbox,ms8_outbox, DYNAMODB_ENDPOINT, RABBITMQ_*
scripts/dev-services.sh poller-stop
```

## Pruebas

```bash
(cd services/ms2-pacientes && ./mvnw test) ; (cd services/ms4-historias && ./mvnw test)   # relay con RabbitMQ de Testcontainers
(cd services/ms6-facturacion && php artisan test --filter=OutboxRelay)
(cd services/ms3-citas/lambda-outbox && set -a && source ../../../.env && set +a && npm test)  # DynamoDB Local + RabbitMQ reales
scripts/dev-services.sh start gateway ms2 ms6 && scripts/test-outbox.sh   # e2e con RabbitMQ apagado y encendido
```
