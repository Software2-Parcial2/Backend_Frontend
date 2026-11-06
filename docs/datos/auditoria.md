# Auditoria del modelo de datos

## 1. Inventario real (antes de esta fase)

### PostgreSQL

| Base | Objeto | Detalle (leido de las migraciones) |
|---|---|---|
| `ms2_pacientes` (Flyway V1, V2) | `pacientes` | PK `id uuid`; `documento` UNIQUE; `nombre`, `fecha_nacimiento` NOT NULL; `telefono`, `email`; `created_at timestamptz` |
| | `outbox` | PK `id uuid`; `aggregate_type/_id`, `event_type`, `payload jsonb`, `created_at`, `published_at`; indice parcial `idx_outbox_pendientes (created_at) WHERE published_at IS NULL` |
| | `idempotency_keys` | PK `key varchar(300)`; `request_hash char(64)`; `status` CHECK (`PROCESANDO`,`COMPLETADO`); `status_code`, `response_body`, `content_type`; `expires_at`; indice `idx_idempotency_keys_expires` |
| `ms4_historias` (V1, V2) | `historias_clinicas` | PK `id`; `paciente_id` UNIQUE NOT NULL; `version bigint` (optimista) |
| | `consultas` | PK `id`; FK `historia_id` -> historias; `medico_id`, `fecha`, `motivo` NOT NULL; `diagnostico`, `tratamiento`; `version`; indice `(historia_id, fecha DESC)` |
| | `outbox`, `idempotency_keys` | identicas a MS2 |
| `ms6_facturacion` (Laravel) | `facturas` | PK `id uuid`; `cita_id`, `paciente_id` (indices); `monto numeric(12,2)`; `estado` CHECK (`PENDIENTE`,`PROVISIONAL`,`CONFIRMADA`,`ANULADA`); indice unico parcial `facturas_cita_vigente_unique (cita_id) WHERE estado <> 'ANULADA'` |
| | `outbox` | como MS2 + `exchange`, `correlation_id`, `causation_id` |
| | `idempotency_keys` | PK `key varchar(200)`; `request_hash`, `status` CHECK, `response json`, `expires_at` (indice) |
| | `processed_messages` | PK `id uuid`; `status` CHECK; `locked_until`; `expires_at` (indice) |
| | `users`, `cache`, `jobs`, ... | Tablas por defecto de Laravel que MS6 **no usa** (ver PENDIENTES, bloque C) |
| `ms7_inteligencia` (`0001_rag.sql`) | `rag_documentos` | PK `id uuid`; `ruta` UNIQUE; `titulo`, `version`, `hash`, `modelo`, `indexado_en` |
| | `rag_fragmentos` | PK `id bigserial`; FK `documento_id` ON DELETE CASCADE; UNIQUE `(documento_id, orden)`; `embedding vector(384)`; HNSW coseno (m=16, ef_construction=64) |
| | `schema_migrations` | ejecutor propio (checksum + bloqueo asesor) |

### DynamoDB (`scripts/dynamodb-init.mjs`, on-demand en todas)

| Tabla | Servicio | Claves | Indices | TTL | Stream |
|---|---|---|---|---|---|
| `citas` | MS3 | `pk`/`sk` | `gsi1` (disperso, KEYS_ONLY), `gsi2` paciente, `gsi3` medico+fecha, `gsi4` general | — | — |
| `idempotency_keys`, `processed_messages` | MS3 | `pk` | — | `expiresAt` | — |
| `outbox` | MS3 | `pk` | — | — | si (NEW_IMAGE) |
| `ms5_idempotency_keys` | MS5 | `pk` | — | `expiresAt` | — |
| `notificaciones` | MS8 | `pk`/`sk` | `gsi1` (pendientes), `gsi2` (recordatorios) | `expiresAt` | — |
| `ms8_idempotency_keys`, `ms8_processed_messages` | MS8 | `pk` | — | `expiresAt` | — |
| `ms8_outbox` | MS8 | `pk` | — | — | si |

Items de `citas`: `CITA#<id>/CITA` (agregado + saga) y `HORARIO#<medico>/<ISO>` (reserva). Items de `notificaciones`: `CITA#<id>/NOTIF#<tipo>`, `CITA#<id>/RECORDATORIO`,
`PACIENTE#<id>/CONTACTO`, `VINCULO#<codigo>/VINCULO`.

### MongoDB

Coleccion `imagenes` (base `sigec_imagenes`), definida solo con Mongoose en MS5: sin validador del servidor; indices `{pacienteId:1, creadaEn:-1, _id:-1}` y `{estado:1, actualizadaEn:1}`
(y uno suelto `pacienteId` por `index: true`).

### Hallazgos de la lectura (corrigen supuestos del encargo)

1. **`GET /api/citas` ya no usa Scan** (bloque 0: Query por `gsi2/gsi3/gsi4` con cursor validado). El unico `Scan` que queda es el **relleno unico** de `dynamodb-init.mjs` para citas anteriores a los indices.
   No hay nada que reemplazar en el codigo de acceso; lo que si falta es la consulta de **disponibilidad de horarios**, que no existe.
2. **MS4 y MS2 de dominio:** MS2 solo implementa pacientes (`POST/GET /api/pacientes`; el listado devuelve todos, sin paginar). MS4 tiene tablas pero **ningun codigo** (solo esqueleto).
3. **No hay catalogo**: `medicoId` y `especialidad` son texto libre en MS3; las tarifas viven en `config/facturacion.php` de MS6.
4. **Todo horario es reservable** (`attribute_not_exists(pk)` en `RESERVAR`): no existen horarios publicados.
5. El modelo de inasistencia de MS7 usa `edad=35, beca=false, inasistencias_previas=0` porque SIGEC no los guarda.
6. La auditoria del agente de MS7 esta **en memoria**.
7. `outbox` e `idempotency_keys` crecen sin limite (solo `idempotency_keys` de DynamoDB tiene TTL).

## 2. Huecos y decisiones

Criterio de dueno: el servicio cuyo lenguaje ubicuo contiene el concepto y que lo cambia. "Minimo": lo necesario para demostrar el flujo.

| # | Hueco | Dueno | Justificacion | Decision |
|---|---|---|---|---|
| 1 | Catalogo de **especialidades** | MS2 | MS2 es el registro maestro de personas y catalogos clinicos; MS3/MS6/MS4 solo guardan el `codigo` | **Implementado** (`especialidades`) |
| 2 | **Medicos** | MS2 | Dato maestro (matricula, especialidad, usuario Keycloak); MS4/MS3 referencian por id | **Implementado** (`medicos`) |
| 3 | **Horarios y disponibilidad** | MS3 | La reserva ya es atomica sobre `HORARIO#medico/<ISO>`; es el mismo item | **Implementado**: Query de disponibilidad + horarios `LIBRE` de semilla. Generacion de agenda por plantilla semanal: **diseñado** |
| 4 | **Tarifas** por especialidad | MS6 | Es dinero y tiene vigencia; hoy estan en un archivo de configuracion | **Implementado** (`tarifas`; el archivo queda como respaldo) |
| 5 | **Edad / seguro / beca** del paciente | MS2 | Atributos del paciente; la edad se deriva de `fecha_nacimiento` (no se almacena) | **Implementado** (`beca`, `tipo_seguro`). Entrega a MS7 por API de MS2: **diseñado** |
| 6 | **Asistencia previa** (asistio / no asistio) | MS3 | El hecho ocurre sobre la cita; el contador por paciente se obtiene por `gsi2` | **Implementado** el atributo `asistencia` en el item de la cita (sin endpoint). Endpoint `PATCH /api/citas/{id}/asistencia`: **diseñado** |
| 7 | **Antecedentes** | MS4 | Parte de la historia clinica | **Implementado** la tabla (sin API) |
| 8 | **Consultas / evolucion clinica** | MS4 | Idem; la evolucion es append-only | **Implementado** `evoluciones` (inmutable) y `consultas.cita_id`, `signos_vitales` (sin API) |
| 9 | **Consentimientos** | MS4 | Consentimiento clinico y de uso de IA sobre imagenes; se consulta con la historia | **Implementado** la tabla (sin API) |
| 10 | **Auditoria de accesos a historias** | MS4 | Quien lee una historia lo sabe MS4 | **Implementado** `auditoria_accesos` (append-only, sin contenido clinico). Escritura desde la API: **diseñado** (MS4 no tiene API) |
| 11 | **Estados de factura / ledger / anulaciones** | MS6 | El estado ya existe; falta la traza | **Implementado** `factura_movimientos` por trigger (no cambia el codigo de MS6) |
| 12 | **Pagos** (cobro definitivo, metodo) | MS6 | La SAGA solo hace cobro provisional; no hay pasarela | **Diseñado**, no implementado |
| 13 | **Preferencias de notificacion y vinculo de Telegram** | MS8 | Ya existen: `PACIENTE#<id>/CONTACTO` y `VINCULO#<codigo>` | Sin cambios |
| 14 | **Metadatos de imagenes y resultado de IA** | MS5 | Ya existen en `imagenes` | Se anade validador e indices por script (`mongo-init`) |
| 15 | **Auditoria del agente de MS7** | MS7 | El agente es de MS7; hoy se pierde al reiniciar | **Implementado** `agente_auditoria` (escritura diferida desde el adaptador) |
| 16 | **Retencion de outbox/idempotencia/processed** | cada servicio | Crecimiento ilimitado | **Implementado** funcion de purga SQL + `make db-purge`; TTL en `citas` para horarios `LIBRE` de semilla |
| 17 | `paciente.actualizado` (cambio de email llega a MS8) | MS2 | Deuda conocida (bloque J) | **Diseñado**, no implementado |
| 18 | Listado de pacientes sin paginar (`GET /api/pacientes`) | MS2 | Cambia el contrato de la API | **Diseñado** (cursor por `(created_at,id)`); no se toca la API |
| 19 | Particion de `gsi4` por mes (hot partition `CITA`) | MS3 | Valida para este volumen | **Diseñado** (ver [dynamodb.md](dynamodb.md)) |
| 20 | Cifrado a nivel de campo de datos clinicos | MS4 | Necesita gestion de claves (KMS) | **Diseñado** (ver [diccionario.md](diccionario.md)) |

## 3. Contradicciones graves con el diseno existente

Ninguna. Se cumple la regla de no renombrar tablas/columnas usadas por el codigo: todos los cambios son **aditivos** (tablas nuevas, columnas con valor por defecto, indices).
Dos matices que no rompen contratos: (a) MS6 lee la tarifa de la tabla y cae al archivo de configuracion si no hay fila (mismo resultado por defecto); (b) las citas de DynamoDB ganan un atributo opcional `asistencia`.
