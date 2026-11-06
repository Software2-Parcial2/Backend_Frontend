# Diagramas entidad-relacion generados

> Generado por `make datos-docs` desde las bases reales (claves y claves foraneas de cada base; las referencias **entre** bases estan en [README.md](README.md)).

## ms2_pacientes

```mermaid
erDiagram
  especialidades {
    uuid id PK
    character_varying codigo UK
    character_varying nombre
    boolean activa
    timestamp_with_time_zone created_at
  }
  idempotency_keys {
    character_varying key PK
    character request_hash
    character_varying status
    integer status_code
    text response_body
    character_varying content_type
    timestamp_with_time_zone created_at
    timestamp_with_time_zone expires_at
  }
  medicos {
    uuid id PK
    character_varying nombre
    character_varying documento UK
    character_varying matricula UK
    uuid especialidad_id FK
    character_varying email
    character_varying telefono
    character_varying usuario_keycloak UK
    boolean activo
    timestamp_with_time_zone created_at
  }
  outbox {
    uuid id PK
    character_varying aggregate_type
    uuid aggregate_id
    character_varying event_type
    jsonb payload
    timestamp_with_time_zone created_at
    timestamp_with_time_zone published_at
  }
  pacientes {
    uuid id PK
    character_varying nombre
    character_varying documento UK
    date fecha_nacimiento
    character_varying telefono
    character_varying email
    timestamp_with_time_zone created_at
    boolean beca
    character_varying tipo_seguro
  }
  especialidades ||--o{ medicos : "especialidad_id"
```

## ms4_historias

```mermaid
erDiagram
  antecedentes {
    uuid id PK
    uuid historia_id FK
    character_varying tipo
    text descripcion
    boolean activo
    timestamp_with_time_zone created_at
    bigint version
  }
  auditoria_accesos {
    bigint id PK
    uuid paciente_id
    uuid historia_id
    character_varying usuario_id
    character_varying rol
    character_varying accion
    character_varying recurso
    timestamp_with_time_zone ocurrido_en
  }
  consentimientos {
    uuid id PK
    uuid paciente_id
    character_varying tipo
    character_varying version_texto
    timestamp_with_time_zone otorgado_en
    timestamp_with_time_zone revocado_en
  }
  consultas {
    uuid id PK
    uuid historia_id FK
    uuid medico_id
    timestamp_with_time_zone fecha
    text motivo
    text diagnostico
    text tratamiento
    timestamp_with_time_zone created_at
    bigint version
    uuid cita_id
    jsonb signos_vitales
  }
  evoluciones {
    uuid id PK
    uuid consulta_id FK
    uuid medico_id
    timestamp_with_time_zone fecha
    text nota
  }
  historias_clinicas {
    uuid id PK
    uuid paciente_id UK
    timestamp_with_time_zone created_at
    bigint version
  }
  idempotency_keys {
    character_varying key PK
    character request_hash
    character_varying status
    integer status_code
    text response_body
    character_varying content_type
    timestamp_with_time_zone created_at
    timestamp_with_time_zone expires_at
  }
  outbox {
    uuid id PK
    character_varying aggregate_type
    uuid aggregate_id
    character_varying event_type
    jsonb payload
    timestamp_with_time_zone created_at
    timestamp_with_time_zone published_at
  }
  historias_clinicas ||--o{ antecedentes : "historia_id"
  historias_clinicas ||--o{ consultas : "historia_id"
  consultas ||--o{ evoluciones : "consulta_id"
```

## ms6_facturacion

```mermaid
erDiagram
  factura_movimientos {
    bigint id PK
    uuid factura_id FK
    character_varying estado_anterior
    character_varying estado_nuevo
    numeric monto
    timestamp_with_time_zone ocurrido_en
  }
  facturas {
    uuid id PK
    uuid cita_id
    uuid paciente_id
    numeric monto
    character_varying estado
    timestamp_without_time_zone created_at
    timestamp_without_time_zone updated_at
    character moneda
  }
  idempotency_keys {
    character_varying key PK
    character_varying request_hash
    character_varying status
    json response
    timestamp_with_time_zone expires_at
    timestamp_without_time_zone created_at
    timestamp_without_time_zone updated_at
  }
  outbox {
    uuid id PK
    character_varying aggregate_type
    uuid aggregate_id
    character_varying event_type
    jsonb payload
    timestamp_with_time_zone created_at
    timestamp_with_time_zone published_at
    character_varying exchange
    uuid correlation_id
    uuid causation_id
  }
  processed_messages {
    uuid id PK
    character_varying status
    timestamp_with_time_zone locked_until
    timestamp_with_time_zone expires_at
  }
  tarifas {
    uuid id PK
    character_varying especialidad UK
    numeric monto
    character moneda
    date vigente_desde UK
    date vigente_hasta
    timestamp_with_time_zone created_at
  }
  facturas ||--o{ factura_movimientos : "factura_id"
```

## ms7_inteligencia

```mermaid
erDiagram
  agente_auditoria {
    bigint id PK
    timestamp_with_time_zone en
    text usuario
    text__ roles
    text herramienta
    jsonb argumentos
    text estado
    text detalle
    integer ms
    integer bytes
  }
  rag_documentos {
    uuid id PK
    text ruta UK
    text titulo
    text version
    text hash
    text modelo
    timestamp_with_time_zone indexado_en
  }
  rag_fragmentos {
    bigint id PK
    uuid documento_id FK
    text seccion
    integer orden UK
    text texto
    vector embedding
  }
  rag_documentos ||--o{ rag_fragmentos : "documento_id"
```

