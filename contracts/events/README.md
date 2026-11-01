# Contrato de eventos y mensajería

Fuente de verdad de los mensajes que viajan por RabbitMQ. Cada mensaje tiene un JSON Schema (`*.schema.json`,
draft 2020-12) que referencia al sobre común (`envelope.schema.json`). La topología declarada en RabbitMQ esta en
`topology.json` y la implementan, con el mismo resultado, `packages/messaging-nest` (Nest), Spring (MS2/MS4) y
Laravel (MS6).

## Sobre

```json
{
  "id": "6b9f…",            // UUID unico del mensaje; los consumidores deduplican por este campo
  "type": "facturacion.cobro-provisional.solicitar",   // = routing key
  "occurredAt": "2026-11-01T16:00:00.000Z",           // ISO 8601 UTC
  "correlationId": "…",     // id de la SAGA (sagaId)
  "causationId": "…",       // id del mensaje que lo causo (null en el primero)
  "version": 1,             // version del esquema del payload
  "payload": { }
}
```

Los mensajes se publican **persistentes** (`delivery_mode=2`), con `content_type=application/json`, `message_id = id`,
y con **publisher confirms**. Los consumidores usan **ack manual**.

## Mensajes

| Tipo (= routing key) | Clase | Productor → Consumidor | Exchange | Payload |
|---|---|---|---|---|
| `facturacion.cobro-provisional.solicitar` | comando | MS3 → MS6 | `sigec.saga` | citaId, pacienteId, medicoId, especialidad, fechaHora |
| `facturacion.cobro.anular` | comando | MS3 → MS6 | `sigec.saga` | citaId, facturaId?, motivo |
| `facturacion.cobro.confirmar` | comando | MS3 → MS6 | `sigec.saga` | citaId, facturaId |
| `notificaciones.cita-confirmada.enviar` | comando | MS3 → MS8 | `sigec.saga` | citaId, pacienteId, medicoId, fechaHora |
| `notificaciones.cita-cancelada.enviar` | comando | MS3 → MS8 | `sigec.saga` | citaId, pacienteId, motivo |
| `facturacion.cobro-provisional.registrado` | respuesta | MS6 → MS3 | `sigec.saga` | citaId, facturaId, monto |
| `facturacion.cobro-provisional.rechazado` | respuesta | MS6 → MS3 | `sigec.saga` | citaId, motivo |
| `facturacion.cobro.anulado` | respuesta | MS6 → MS3 | `sigec.saga` | citaId, facturaId? |
| `notificaciones.cita-confirmada.enviada` | respuesta | MS8 → MS3 | `sigec.saga` | citaId, notificacionId, canal |
| `notificaciones.cita-confirmada.fallida` | respuesta | MS8 → MS3 | `sigec.saga` | citaId, motivo |
| `paciente.creado` | evento de dominio | MS2 → varios | `sigec.eventos` | pacienteId, nombre, documento |
| `factura.creada` | evento de dominio | MS6 → varios | `sigec.eventos` | facturaId, citaId, pacienteId, monto, estado |

Las respuestas conservan el `correlationId` del comando y ponen su `id` en el `causationId`.

## Eventos de dominio y outbox

Los eventos de dominio (`paciente.creado`, `factura.creada`) se escriben en la tabla `outbox` en la **misma transaccion** que el cambio
de negocio. Un relay los publica en `sigec.eventos` **al menos una vez**: el `id` del sobre es el id de la fila del outbox, de modo que
una reentrega lleva el mismo `id` y el consumidor la descarta (dedupe por `id`). El `occurredAt` del sobre es el `created_at` de la fila
y `correlationId` es el id del agregado.

## Topologia

| Exchange | Tipo | Uso |
|---|---|---|
| `sigec.saga` | direct | comandos y respuestas de la SAGA (routing key = type) |
| `sigec.eventos` | topic | eventos de dominio (outbox) |
| `sigec.retry` | direct | reintentos con retardo (colas de espera) |
| `sigec.dlx` | direct | mensajes que agotaron los reintentos |

Cada cola de consumo `<q>` (durable) tiene:

- `x-dead-letter-exchange=sigec.dlx`, `x-dead-letter-routing-key=<q>.dlq` (rechazo definitivo / `nack` sin requeue).
- `<q>.dlq`: cola durable enlazada a `sigec.dlx` con la clave `<q>.dlq`.
- Colas de espera `<q>.retry.5s`, `<q>.retry.30s`, `<q>.retry.2m`: enlazadas a `sigec.retry` con su nombre como clave,
  con `x-message-ttl` y `x-dead-letter-exchange=""` + `x-dead-letter-routing-key=<q>`, de modo que al vencer el TTL el
  mensaje vuelve a `<q>`.

### Reintentos

Cuando el handler falla, el consumidor **hace ack** del original y republica una copia en `sigec.retry` hacia la cola de
espera del nivel `min(intento, 3)` con la cabecera `x-retries = intento + 1`. Si `x-retries` supera 3 (`maxRetries`),
la copia se publica en `sigec.dlx` → `<q>.dlq`. Un mensaje que no es JSON valido o no cumple el sobre se envia directo a DLQ
(no tiene sentido reintentarlo).

### Colas

| Cola | Duena | Claves enlazadas |
|---|---|---|
| `ms6.saga.comandos` | MS6 | los tres comandos `facturacion.*` |
| `ms8.saga.comandos` | MS8 | los dos comandos `notificaciones.*` |
| `ms3.saga.respuestas` | MS3 | las cinco respuestas |
| `ms4.eventos.pacientes` | MS4 | `paciente.creado` |

Cada servicio declara sus colas al arrancar (idempotente; si los argumentos difieren RabbitMQ responde `406
PRECONDITION_FAILED`, lo que sirve de comprobacion de consistencia). `make rabbitmq-declare` declara **toda** la
topologia a partir de `topology.json`.

## Validacion

`packages/messaging-nest` valida el sobre con Ajv. Los schemas por tipo sirven de documentacion y para pruebas de contrato.
