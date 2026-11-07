# Archivos SQL y migraciones por servicio

Índice de los archivos que crean y modifican el esquema de cada base. Para el detalle de columnas ver [diccionario-generado.md](diccionario-generado.md); para diagramas, [erd-generado.md](erd-generado.md) y [postgresql.md](postgresql.md) (Mermaid `erDiagram`, listos para copiar).

Este índice se escribió leyendo los archivos; si añades una migración, actualízalo.


## MS2 Pacientes

Base `ms2_pacientes` · PostgreSQL, Flyway

| Archivo | Crea tablas | Modifica | Índices |
|---|---|---|---|
| `services/ms2-pacientes/src/main/resources/db/migration/V1__init.sql` | pacientes, outbox | — | 1 |
| `services/ms2-pacientes/src/main/resources/db/migration/V2__idempotency_keys.sql` | idempotency_keys | — | 1 |
| `services/ms2-pacientes/src/main/resources/db/migration/V3__catalogo_y_atributos.sql` | especialidades, medicos | pacientes | 2 |

## MS4 Historias clínicas

Base `ms4_historias` · PostgreSQL, Flyway

| Archivo | Crea tablas | Modifica | Índices |
|---|---|---|---|
| `services/ms4-historias/src/main/resources/db/migration/V1__init.sql` | historias_clinicas, consultas, outbox | — | 2 |
| `services/ms4-historias/src/main/resources/db/migration/V2__idempotency_keys.sql` | idempotency_keys | — | 1 |
| `services/ms4-historias/src/main/resources/db/migration/V3__antecedentes_evolucion_auditoria.sql` | antecedentes, evoluciones, consentimientos, auditoria_accesos | consultas, historias_clinicas | 8 |

## MS6 Facturación

Base `ms6_facturacion` · PostgreSQL, migraciones Laravel (las 3 migraciones por defecto `users`, `cache`, `jobs` no se listan: MS6 no las usa)

| Archivo | Crea tablas | Modifica | Índices |
|---|---|---|---|
| `services/ms6-facturacion/database/migrations/2026_11_01_160843_create_facturas_table.php` | facturas | — | 2 |
| `services/ms6-facturacion/database/migrations/2026_11_01_160844_create_outbox_table.php` | outbox | — | 0 |
| `services/ms6-facturacion/database/migrations/2026_11_01_160845_create_idempotency_keys_table.php` | idempotency_keys | — | 1 |
| `services/ms6-facturacion/database/migrations/2026_11_02_000001_create_processed_messages_table.php` | processed_messages | — | 1 |
| `services/ms6-facturacion/database/migrations/2026_11_02_000002_extend_outbox_and_facturas_for_saga.php` | — (SQL crudo) | outbox (+`exchange`, `correlation_id`, `causation_id`), facturas (índice único `facturas_cita_vigente_unique`) | 1 |
| `services/ms6-facturacion/database/migrations/2026_11_06_000001_tarifas_ledger_y_retencion.php` | tarifas, factura_movimientos (SQL crudo) | facturas (+`moneda`, CHECK de monto, 2 índices), outbox (índice de publicados) | 4 |

## MS7 Inteligencia

Base `ms7_inteligencia` · PostgreSQL + pgvector, ejecutor propio (checksum)

| Archivo | Crea tablas | Modifica | Índices |
|---|---|---|---|
| `services/ms7-inteligencia/api/migrations/0001_rag.sql` | rag_documentos, rag_fragmentos | — | 2 |
| `services/ms7-inteligencia/api/migrations/0002_auditoria_agente.sql` | agente_auditoria | rag_fragmentos | 2 |

## Sin SQL: DynamoDB y MongoDB

| Servicio | Almacén | Dónde se define |
|---|---|---|
| MS3 Citas | DynamoDB `citas`, `idempotency_keys`, `outbox`, `processed_messages` | `scripts/dynamodb-init.mjs`; patrones en [dynamodb.md](dynamodb.md) |
| MS5 Imágenes | MongoDB `sigec_imagenes.imagenes` (validador `$jsonSchema`) | `scripts/mongo-init/esquema.mjs`; ver [mongodb.md](mongodb.md) |
| MS5 | DynamoDB `ms5_idempotency_keys` | `scripts/dynamodb-init.mjs` |
| MS8 Notificaciones | DynamoDB `notificaciones`, `ms8_idempotency_keys`, `ms8_outbox`, `ms8_processed_messages` | `scripts/dynamodb-init.mjs` |

Las bases `keycloak` y `n8n` las gestionan sus productos; `infra/postgres/init.sql` solo crea las bases vacías y la extensión `vector` en `ms7_inteligencia`.

