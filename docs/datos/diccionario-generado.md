# Diccionario de datos generado

> **Generado** por `make datos-docs` (`scripts/datos/generar-docs.mjs`) desde las bases reales. No editar a mano: edita la migracion (COMMENT ON COLUMN) o el generador.
> La politica y el tratamiento de los datos sensibles estan en [diccionario.md](diccionario.md). Columna **Sensible**: `si` + categoria cuando la columna lleva
> `COMMENT ... 'SENSIBLE: ...'`; `no` en caso contrario.

## ms2_pacientes — MS2 Pacientes (catalogo clinico)

### `especialidades`

Catalogo de especialidades. MS3/MS6/MS4 la referencian por codigo (cadena en minusculas).

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `codigo` | character varying(40) | no | UQ; CHECK (((codigo)::text ~ '^[a-z0-9_]+$'::text)) | Clave natural estable usada por MS3 (cita.especialidad) y MS6 (tarifas.especialidad) | no |
| `nombre` | character varying(100) | no | CHECK ((char_length(btrim((nombre)::text)) > 0)) |  | no |
| `activa` | boolean | no | — | defecto `true` | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |

### `idempotency_keys`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `key` | character varying(300) | no | PK |  | no |
| `request_hash` | character(64) | no | — |  | no |
| `status` | character varying(20) | no | CHECK (((status)::text = ANY ((ARRAY['PROCESANDO'::character varying, 'COMPLETADO'::character varying])::text[]))) |  | no |
| `status_code` | integer | si | — |  | no |
| `response_body` | text | si | — |  | si — personal: respuesta cacheada 24 h |
| `content_type` | character varying(100) | si | — |  | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `expires_at` | timestamp with time zone | no | idx idx_idempotency_keys_expires |  | no |

### `medicos`

Medicos (dato maestro). MS3 los referencia por id en cita.medicoId; MS4 en consultas.medico_id.

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `nombre` | character varying(200) | no | CHECK ((char_length(btrim((nombre)::text)) > 0)) |  | si — personal |
| `documento` | character varying(30) | no | UQ |  | si — personal |
| `matricula` | character varying(30) | no | UQ |  | si — personal (registro profesional) |
| `especialidad_id` | uuid | no | FK→especialidades; idx idx_medicos_especialidad parcial |  | no |
| `email` | character varying(200) | si | — |  | si — personal |
| `telefono` | character varying(30) | si | — |  | si — personal |
| `usuario_keycloak` | character varying(100) | si | UQ | preferred_username del usuario de Keycloak; une medico y usuario sin tocar el realm | no |
| `activo` | boolean | no | — | defecto `true` | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |

Indices compuestos / parciales / especiales:

- `idx_medicos_especialidad`: `medicos USING btree (especialidad_id) WHERE activo`

### `outbox`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `aggregate_type` | character varying(100) | no | — |  | no |
| `aggregate_id` | uuid | no | — |  | no |
| `event_type` | character varying(100) | no | — |  | no |
| `payload` | jsonb | no | — |  | si — personal: el evento paciente.creado lleva nombre, documento y email (contrato) |
| `created_at` | timestamp with time zone | no | idx idx_outbox_pendientes parcial | defecto `now()` | no |
| `published_at` | timestamp with time zone | si | idx idx_outbox_publicados parcial |  | no |

Indices compuestos / parciales / especiales:

- `idx_outbox_pendientes`: `outbox USING btree (created_at) WHERE (published_at IS NULL)`
- `idx_outbox_publicados`: `outbox USING btree (published_at) WHERE (published_at IS NOT NULL)`

### `pacientes`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `nombre` | character varying(200) | no | CHECK ((char_length(btrim((nombre)::text)) > 0)) |  | si — personal |
| `documento` | character varying(30) | no | UQ |  | si — personal (identificacion) |
| `fecha_nacimiento` | date | no | CHECK ((fecha_nacimiento >= '1900-01-01'::date)) |  | si — personal |
| `telefono` | character varying(30) | si | — |  | si — personal |
| `email` | character varying(200) | si | — |  | si — personal |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `beca` | boolean | no | — | defecto `false` | si — socioeconomico; alimenta el modelo de inasistencia de MS7 |
| `tipo_seguro` | character varying(20) | no | CHECK (((tipo_seguro)::text = ANY ((ARRAY['NINGUNO'::character varying, 'PUBLICO'::character varying, 'PRIVADO'::character varying])::text[]))) | defecto `'NINGUNO'::character varying` | si — socioeconomico; alimenta el modelo de inasistencia de MS7 |

## ms4_historias — MS4 Historias clinicas

### `antecedentes`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `historia_id` | uuid | no | FK→historias_clinicas; idx idx_antecedentes_historia |  | no |
| `tipo` | character varying(20) | no | idx idx_antecedentes_historia; CHECK (((tipo)::text = ANY ((ARRAY['ALERGIA'::character varying, 'PERSONAL'::character varying, 'FAMILIAR'::character varying, 'QUIRURGICO'::character varying, 'MEDICACION'::character varying])::text[]))) |  | no |
| `descripcion` | text | no | CHECK ((char_length(btrim(descripcion)) > 0)) |  | si — clinico |
| `activo` | boolean | no | — | defecto `true` | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `version` | bigint | no | CHECK ((version >= 0)) | defecto `0` | no |

Indices compuestos / parciales / especiales:

- `idx_antecedentes_historia`: `antecedentes USING btree (historia_id, tipo)`

### `auditoria_accesos`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | bigint | no | PK |  | no |
| `paciente_id` | uuid | no | idx idx_auditoria_paciente |  | si — personal (traza de acceso) |
| `historia_id` | uuid | si | — |  | no |
| `usuario_id` | character varying(100) | no | — | sub de Keycloak | no |
| `rol` | character varying(30) | no | — |  | no |
| `accion` | character varying(20) | no | CHECK (((accion)::text = ANY ((ARRAY['LEER'::character varying, 'CREAR'::character varying, 'MODIFICAR'::character varying, 'EXPORTAR'::character varying])::text[]))) |  | no |
| `recurso` | character varying(40) | no | — |  | no |
| `ocurrido_en` | timestamp with time zone | no | idx idx_auditoria_paciente; idx idx_auditoria_fecha_brin (brin) | defecto `now()` | no |

Indices compuestos / parciales / especiales:

- `idx_auditoria_paciente`: `auditoria_accesos USING btree (paciente_id, ocurrido_en DESC)`
- `idx_auditoria_fecha_brin`: `auditoria_accesos USING brin (ocurrido_en)`

### `consentimientos`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `paciente_id` | uuid | no | idx consentimientos_vigente_unique parcial |  | si — personal. Referencia a MS2 pacientes.id |
| `tipo` | character varying(30) | no | idx consentimientos_vigente_unique parcial; CHECK (((tipo)::text = ANY ((ARRAY['TRATAMIENTO_DATOS'::character varying, 'IMAGENES_IA'::character varying, 'NOTIFICACIONES'::character varying])::text[]))) |  | no |
| `version_texto` | character varying(20) | no | — |  | no |
| `otorgado_en` | timestamp with time zone | no | — | defecto `now()` | no |
| `revocado_en` | timestamp with time zone | si | — |  | no |

Indices compuestos / parciales / especiales:

- `consentimientos_vigente_unique`: `UNIQUE consentimientos USING btree (paciente_id, tipo) WHERE (revocado_en IS NULL)`

### `consultas`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `historia_id` | uuid | no | FK→historias_clinicas; idx idx_consultas_historia |  | no |
| `medico_id` | uuid | no | idx idx_consultas_medico | Referencia a MS2 medicos.id (sin FK entre bases) | no |
| `fecha` | timestamp with time zone | no | idx idx_consultas_historia; idx idx_consultas_medico |  | no |
| `motivo` | text | no | — |  | si — clinico |
| `diagnostico` | text | si | — |  | si — clinico |
| `tratamiento` | text | si | — |  | si — clinico |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `version` | bigint | no | CHECK ((version >= 0)) | defecto `0` | no |
| `cita_id` | uuid | si | idx consultas_cita_unique parcial | Referencia a MS3 CITA#<id> (sin FK entre servicios) | no |
| `signos_vitales` | jsonb | si | — |  | si — clinico |

Indices compuestos / parciales / especiales:

- `idx_consultas_historia`: `consultas USING btree (historia_id, fecha DESC)`
- `consultas_cita_unique`: `UNIQUE consultas USING btree (cita_id) WHERE (cita_id IS NOT NULL)`
- `idx_consultas_medico`: `consultas USING btree (medico_id, fecha DESC)`

### `evoluciones`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `consulta_id` | uuid | no | FK→consultas; idx idx_evoluciones_consulta |  | no |
| `medico_id` | uuid | no | — | Referencia a MS2 medicos.id | no |
| `fecha` | timestamp with time zone | no | idx idx_evoluciones_consulta | defecto `now()` | no |
| `nota` | text | no | CHECK ((char_length(btrim(nota)) > 0)) |  | si — clinico |

Indices compuestos / parciales / especiales:

- `idx_evoluciones_consulta`: `evoluciones USING btree (consulta_id, fecha)`

### `historias_clinicas`

SENSIBLE: clinico (agregado de la historia)

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `paciente_id` | uuid | no | UQ | Referencia a MS2 pacientes.id (sin FK entre bases) | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `version` | bigint | no | CHECK ((version >= 0)) | defecto `0` | no |

### `idempotency_keys`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `key` | character varying(300) | no | PK |  | no |
| `request_hash` | character(64) | no | — |  | no |
| `status` | character varying(20) | no | CHECK (((status)::text = ANY ((ARRAY['PROCESANDO'::character varying, 'COMPLETADO'::character varying])::text[]))) |  | no |
| `status_code` | integer | si | — |  | no |
| `response_body` | text | si | — |  | si — personal: respuesta cacheada 24 h |
| `content_type` | character varying(100) | si | — |  | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |
| `expires_at` | timestamp with time zone | no | idx idx_idempotency_keys_expires |  | no |

### `outbox`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `aggregate_type` | character varying(100) | no | — |  | no |
| `aggregate_id` | uuid | no | — |  | no |
| `event_type` | character varying(100) | no | — |  | no |
| `payload` | jsonb | no | — |  | si — potencialmente clinico: no publicar datos clinicos en eventos |
| `created_at` | timestamp with time zone | no | idx idx_outbox_pendientes parcial | defecto `now()` | no |
| `published_at` | timestamp with time zone | si | idx idx_outbox_publicados parcial |  | no |

Indices compuestos / parciales / especiales:

- `idx_outbox_pendientes`: `outbox USING btree (created_at) WHERE (published_at IS NULL)`
- `idx_outbox_publicados`: `outbox USING btree (published_at) WHERE (published_at IS NOT NULL)`

## ms6_facturacion — MS6 Facturacion

### `factura_movimientos`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | bigint | no | PK |  | no |
| `factura_id` | uuid | no | FK→facturas; idx factura_movimientos_factura_idx |  | no |
| `estado_anterior` | character varying(20) | si | — |  | no |
| `estado_nuevo` | character varying(20) | no | — |  | no |
| `monto` | numeric(12,2) | no | — |  | no |
| `ocurrido_en` | timestamp with time zone | no | idx factura_movimientos_factura_idx | defecto `now()` | no |

Indices compuestos / parciales / especiales:

- `factura_movimientos_factura_idx`: `factura_movimientos USING btree (factura_id, ocurrido_en)`

### `facturas`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `cita_id` | uuid | no | idx facturas_cita_id_index; idx facturas_cita_vigente_unique parcial | Referencia a MS3 CITA#<id> | no |
| `paciente_id` | uuid | no | idx facturas_paciente_fecha_idx |  | si — personal. Referencia a MS2 pacientes.id (sin FK entre bases) |
| `monto` | numeric(12,2) | no | CHECK ((monto >= (0)::numeric)) |  | si — financiero |
| `estado` | character varying(20) | no | idx facturas_estado_fecha_idx; CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'PROVISIONAL'::character varying, 'CONFIRMADA'::character varying, 'ANULADA'::character varying])::text[]))) | defecto `'PENDIENTE'::character varying` | no |
| `created_at` | timestamp(0) without time zone | si | idx facturas_paciente_fecha_idx; idx facturas_estado_fecha_idx |  | no |
| `updated_at` | timestamp(0) without time zone | si | — |  | no |
| `moneda` | character(3) | no | — | defecto `'BOB'::bpchar` | no |

Indices compuestos / parciales / especiales:

- `facturas_cita_vigente_unique`: `UNIQUE facturas USING btree (cita_id) WHERE ((estado)::text <> 'ANULADA'::text)`
- `facturas_paciente_fecha_idx`: `facturas USING btree (paciente_id, created_at DESC)`
- `facturas_estado_fecha_idx`: `facturas USING btree (estado, created_at)`

### `idempotency_keys`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `key` | character varying(200) | no | PK |  | no |
| `request_hash` | character varying(64) | no | — |  | no |
| `status` | character varying(20) | no | CHECK (((status)::text = ANY ((ARRAY['PROCESANDO'::character varying, 'COMPLETADO'::character varying])::text[]))) | defecto `'PROCESANDO'::character varying` | no |
| `response` | json | si | — |  | si — personal: respuesta cacheada 24 h |
| `expires_at` | timestamp(0) with time zone | no | idx idempotency_keys_expires_at_index |  | no |
| `created_at` | timestamp(0) without time zone | si | — |  | no |
| `updated_at` | timestamp(0) without time zone | si | — |  | no |

### `outbox`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `aggregate_type` | character varying(100) | no | — |  | no |
| `aggregate_id` | uuid | no | — |  | no |
| `event_type` | character varying(100) | no | — |  | no |
| `payload` | jsonb | no | — |  | no |
| `created_at` | timestamp(0) with time zone | no | idx idx_outbox_pendientes parcial | defecto `CURRENT_TIMESTAMP` | no |
| `published_at` | timestamp(0) with time zone | si | idx idx_outbox_publicados parcial |  | no |
| `exchange` | character varying(100) | no | — | defecto `'sigec.eventos'::character varying` | no |
| `correlation_id` | uuid | si | — |  | no |
| `causation_id` | uuid | si | — |  | no |

Indices compuestos / parciales / especiales:

- `idx_outbox_pendientes`: `outbox USING btree (created_at) WHERE (published_at IS NULL)`
- `idx_outbox_publicados`: `outbox USING btree (published_at) WHERE (published_at IS NOT NULL)`

### `processed_messages`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `status` | character varying(20) | no | CHECK (((status)::text = ANY ((ARRAY['PROCESANDO'::character varying, 'COMPLETADO'::character varying])::text[]))) |  | no |
| `locked_until` | timestamp(0) with time zone | si | — |  | no |
| `expires_at` | timestamp(0) with time zone | no | idx processed_messages_expires_at_index |  | no |

### `tarifas`

Tarifa del cobro provisional por especialidad (codigo de MS2 especialidades.codigo). Monto 0 = sin tarifa: se rechaza el cobro.

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK |  | no |
| `especialidad` | character varying(40) | no | UQ(especialidad,vigente_desde); CHECK (((especialidad)::text ~ '^[a-z0-9_]+$'::text)) |  | no |
| `monto` | numeric(12,2) | no | CHECK ((monto >= (0)::numeric)) |  | no |
| `moneda` | character(3) | no | — | defecto `'BOB'::bpchar` | no |
| `vigente_desde` | date | no | UQ(especialidad,vigente_desde) | defecto `CURRENT_DATE` | no |
| `vigente_hasta` | date | si | — |  | no |
| `created_at` | timestamp with time zone | no | — | defecto `now()` | no |

## ms7_inteligencia — MS7 Inteligencia

### `agente_auditoria`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | bigint | no | PK |  | no |
| `en` | timestamp with time zone | no | idx agente_auditoria_en_idx; idx agente_auditoria_usuario_idx |  | no |
| `usuario` | text | no | idx agente_auditoria_usuario_idx |  | si — personal (identificador del usuario de Keycloak) |
| `roles` | text[] | no | — | defecto `'{}'::text[]` | no |
| `herramienta` | text | no | — |  | no |
| `argumentos` | jsonb | si | — |  | si — puede contener filtros de consulta; nunca datos clinicos |
| `estado` | text | no | CHECK ((estado = ANY (ARRAY['ok'::text, 'error'::text, 'rechazada'::text]))) |  | no |
| `detalle` | text | si | — |  | no |
| `ms` | integer | no | CHECK ((ms >= 0)) |  | no |
| `bytes` | integer | no | CHECK ((bytes >= 0)) |  | no |

Indices compuestos / parciales / especiales:

- `agente_auditoria_usuario_idx`: `agente_auditoria USING btree (usuario, en DESC)`

### `rag_documentos`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | uuid | no | PK | defecto `gen_random_uuid()` | no |
| `ruta` | text | no | UQ |  | no |
| `titulo` | text | no | — |  | no |
| `version` | text | no | — |  | no |
| `hash` | text | no | — |  | no |
| `modelo` | text | no | — |  | no |
| `indexado_en` | timestamp with time zone | no | — | defecto `now()` | no |

### `rag_fragmentos`

| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |
|---|---|---|---|---|---|
| `id` | bigint | no | PK | defecto `nextval('rag_fragmentos_id_seq'::regclass)` | no |
| `documento_id` | uuid | no | UQ(documento_id,orden); FK→rag_documentos; idx rag_fragmentos_documento_idx |  | no |
| `seccion` | text | no | — |  | no |
| `orden` | integer | no | UQ(documento_id,orden); CHECK ((orden >= 0)) |  | no |
| `texto` | text | no | — |  | no |
| `embedding` | vector(384) | no | idx rag_fragmentos_embedding_hnsw (hnsw) |  | no |

Indices compuestos / parciales / especiales:

- `rag_fragmentos_embedding_hnsw`: `rag_fragmentos USING hnsw (embedding vector_cosine_ops) WITH (m='16', ef_construction='64')`

## DynamoDB (estructura real)

| Tabla | Clave | Indices (proyeccion) | TTL | Stream | Facturacion |
|---|---|---|---|---|---|
| `citas` | pk (pk) + sk (sk) | gsi1 [gsi1pk+gsi1sk] KEYS_ONLY; gsi2 [gsi2pk+gsi2sk] ALL; gsi3 [gsi3pk+gsi3sk] ALL; gsi4 [gsi4pk+gsi4sk] ALL | expiresAt | — | PAY_PER_REQUEST |
| `idempotency_keys` | pk (pk) | — | expiresAt | — | PAY_PER_REQUEST |
| `outbox` | pk (pk) | — | — | NEW_IMAGE | PAY_PER_REQUEST |
| `processed_messages` | pk (pk) | — | expiresAt | — | PAY_PER_REQUEST |
| `ms5_idempotency_keys` | pk (pk) | — | expiresAt | — | PAY_PER_REQUEST |
| `notificaciones` | pk (pk) + sk (sk) | gsi1 [gsi1pk+gsi1sk] KEYS_ONLY; gsi2 [gsi2pk+gsi2sk] ALL | expiresAt | — | PAY_PER_REQUEST |
| `ms8_idempotency_keys` | pk (pk) | — | expiresAt | — | PAY_PER_REQUEST |
| `ms8_outbox` | pk (pk) | — | — | NEW_IMAGE | PAY_PER_REQUEST |
| `ms8_processed_messages` | pk (pk) | — | expiresAt | — | PAY_PER_REQUEST |

### Atributos de los items (documentados desde el codigo: `dynamo-cita.repository.ts`, `dynamo-notificaciones.repositories.ts`)

| Tabla / item | Atributo | Tipo | Nulo | Descripcion | Sensible |
|---|---|---|---|---|---|
| citas · CITA#id/CITA | `citaId` | S | no | id de la cita | no |
| | `input.pacienteId` | S | no | ref MS2 pacientes.id | si — personal (id) |
| | `input.medicoId` | S | no | ref MS2 medicos.id | no |
| | `input.especialidad` | S | no | codigo (MS2 especialidades.codigo) | no |
| | `input.fechaHora` | S | no | ISO 8601 UTC | si — personal (cuando se atiende) |
| | `estado` | S | no | PENDIENTE, RESERVADA, COBRO_PROVISIONAL, CONFIRMADA, CANCELADA, ANULADA | no |
| | `facturaId` | S | si | ref MS6 facturas.id | no |
| | `motivoFallo` | S | si | motivo de cancelacion; **sin datos clinicos** | no |
| | `notificacion` | M | no | estado, intentos, proximoIntento | no |
| | `saga` | M | no | sagaId, estado, paso, intentos, deadline, compensaciones, historial | no |
| | `asistencia` | S | si | ASISTIO / NO_ASISTIO (nuevo, opcional) | si — personal (comportamiento) |
| | `version`, `createdAt`, `updatedAt` | N | no | optimista; epoch ms | no |
| | `gsi1pk/gsi1sk` ... `gsi4pk/gsi4sk` | S/N | si | claves de los indices | no |
| citas · HORARIO#medico/ISO | `estado` | S | no | LIBRE, RESERVADO, CONFIRMADO | no |
| | `citaId`, `reservaExpiraEn` | S, N | si | dueno de la reserva; vencimiento (epoch ms) | no |
| | `expiresAt` | N | si | TTL (epoch s) solo en horarios libres de semilla | no |
| notificaciones · PACIENTE#id/CONTACTO | `nombre`, `email` | S | si | contacto del paciente | si — personal |
| | `canales`, `telegramChatId` | L, S | si | preferencias y vinculo de Telegram | si — personal |
| notificaciones · CITA#id/NOTIF#tipo | `estado`, `canalesEnviados`, `intentos`, `proximoIntento`, `ultimoError` | | | seguimiento del envio | no |
| | `fechaHora`, `motivo` | S | si | datos para la plantilla; **sin datos clinicos** | si — personal |
| notificaciones · CITA#id/RECORDATORIO | `citaId`, `pacienteId`, `fechaHora`, `marcado` | | | recordatorio pendiente | si — personal |
| notificaciones · VINCULO#codigo | `pacienteId`, `expiraEn`, `usado`, `expiresAt` | | | codigo de un solo uso (10 min) | si — secreto |
| *_idempotency_keys | `pk`, `requestHash`, `status`, `response`, `expiresAt` | | | clave `<sub>:<Idempotency-Key>` | si — la respuesta cacheada puede ser personal |
| *_processed_messages | `pk`, `status`, `lockedUntil`, `expiresAt` | | | id del mensaje | no |
| *_outbox | `pk`, `exchange`, `routingKey`, `envelope`, `createdAt` | | | evento a publicar | potencialmente: sin datos clinicos |

## MongoDB — sigec_imagenes

### `imagenes`

Validador `$jsonSchema` (strict, error). Indices: `pacienteId_1_creadaEn_-1__id_-1`, `estado_1_actualizadaEn_1`, `hashSha256_1`, `objectKey_1` (unico).

| Campo | Tipo BSON | Requerido | Restricciones | Sensible |
|---|---|---|---|---|
| `_id` | string | si | minLength 1 | no |
| `pacienteId` | string | si | minLength 1 | si — personal (id) |
| `estudio` | string | si | minLength 1 | si — clinico |
| `estado` | string | si | enum SUBIDA/ANALIZANDO/ANALIZADA/FALLIDA | no |
| `hashSha256` | string | si | patron ^[0-9a-f]{64}$ | no |
| `mime` | string | si | enum image/jpeg/image/png/application/dicom | no |
| `bytes` | int / long / double | si | >= 0 | no |
| `bucket` | string | si | minLength 1 | no |
| `objectKey` | string | si | minLength 1 | si — secreto (nunca se expone) |
| `usuarioId` | string | si | minLength 1 | si — personal (id) |
| `resultado` | object | no | — | si — clinico (apoyo a decision, no diagnostico) |
| `error` | string | no | — | no |
| `intentosAnalisis` | int / long / double | no | >= 0 | no |
| `creadaEn` | int / long / double | si | >= 0 | no |
| `actualizadaEn` | int / long / double | si | >= 0 | no |

