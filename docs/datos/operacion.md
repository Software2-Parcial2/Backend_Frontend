# Operacion: migraciones, semillas, copias de seguridad y retencion

## Estrategia de migraciones

| Base | Herramienta | Ubicacion | Reglas |
|---|---|---|---|
| ms2, ms4 | Flyway (Spring) | `services/ms*/src/main/resources/db/migration/V<n>__*.sql` | Nunca editar una `V` aplicada; la siguiente es `V3`, `V4`... Flyway valida checksum al arrancar |
| ms6 | Laravel | `services/ms6-facturacion/database/migrations/AAAA_MM_DD_hhmmss_*.php` | Migraciones nuevas, con `down()` |
| ms7 | Ejecutor propio | `services/ms7-inteligencia/api/migrations/NNNN_*.sql` | Checksum + bloqueo asesor (`schema_migrations`); inmutables |
| DynamoDB | `scripts/dynamodb-init.mjs` | idempotente | Crea tablas/indices/TTL/stream si faltan; el relleno de indices es idempotente |
| MongoDB | `scripts/mongo-init` | idempotente | `create`/`collMod` del validador + `createIndex` (idempotente) |

Principios: **aditivas** (columna nueva con `DEFAULT`, tabla nueva, indice nuevo); un cambio incompatible se hace en dos pasos (expandir -> migrar datos -> contraer, en versiones distintas).
Se verifica siempre: (1) base vacia -> esquema final; (2) base con las migraciones anteriores -> actualizacion sin perdida.

## Datos semilla (solo desarrollo)

`make seed` (repetible: `ON CONFLICT DO NOTHING` / `PutItem` idempotente / `upsert`) y `make seed-reset` (borra **solo** lo sembrado, identificado por ids fijos; se niega a correr si `SIGEC_ENV` es `prod`/`production`).
Ids fijos (UUID v4 con prefijo reconocible) para que las referencias entre servicios sean coherentes. Todos los datos son ficticios. Detalle en `scripts/seed/README.md`.

## Copias de seguridad

| Almacen | Local (desarrollo) | Produccion (propuesta) |
|---|---|---|
| PostgreSQL | `make db-backup` -> `pg_dump -Fc` por base en `backups/` (fuera de Git) | Base gestionada con PITR (WAL continuo), snapshot diario, retencion 14-35 dias; prueba de restauracion mensual |
| DynamoDB | no se respalda (datos reconstruibles con semilla) | PITR activado + AWS Backup semanal |
| MongoDB | `mongodump` (manual) | Snapshot diario del cluster |
| S3 | no | Versionado + replicacion |
| Keycloak / n8n | **fuera de alcance** | — |

Orden de restauracion: Keycloak -> PostgreSQL (todas) -> DynamoDB -> Mongo/S3. Despues de restaurar PostgreSQL hay que reiniciar los relays del outbox: lo no publicado se reenvia (al menos una vez; los consumidores deduplican).

## Retencion y limpieza

- `make db-purge`: ejecuta `purgar_tecnico()` en ms2, ms4 y ms6 (outbox publicado > 7 dias, idempotencia vencida, processed_messages vencidos).
- DynamoDB: TTL en `expiresAt` (idempotencia, deduplicacion, vinculos, horarios libres de semilla).
- Politicas por dato personal/clinico: ver [diccionario.md](diccionario.md).
