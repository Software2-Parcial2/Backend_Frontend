# Contrato de idempotencia (`Idempotency-Key`)

Aplica a **POST, PUT y PATCH** de operaciones de negocio bajo `/api/**`. Los GET estan exentos. Se exige en
`POST /api/pacientes` (MS2), `POST /api/citas` (MS3) y `POST /api/facturacion/facturas` (MS6).

## Cabecera

`Idempotency-Key: <UUID>` generado por el cliente (uno por intencion de negocio; se reutiliza al reintentar).

## Huella de la peticion

`requestHash = SHA-256( METHOD + " " + rutaConQuery + "\n" + SHA-256(cuerpo) )` en hexadecimal minuscula.
El cuerpo JSON se canonicaliza (claves ordenadas) antes de calcular su hash, de modo que el orden de las claves no
cambia la huella. Un cuerpo vacio se trata como `{}`.

## Almacen

Por cada clave se guarda: clave, `requestHash`, `status` (`PROCESANDO` | `COMPLETADO`), codigo y cuerpo de la respuesta
(y su `Content-Type`), `createdAt` y `expiresAt` (**24 h**). La clave se **acota por usuario** (`sub` del JWT):
`<sub>:<Idempotency-Key>`, para que un usuario nunca reciba la respuesta guardada de otro.

## Reglas

| Situacion | Respuesta |
|---|---|
| Falta la cabecera, o no es un UUID | `400` `application/problem+json` |
| Clave nueva (o expirada) | Se **reserva atomicamente** como `PROCESANDO`, se ejecuta y se guarda la respuesta como `COMPLETADO` |
| Misma clave, **mismo** `requestHash`, `COMPLETADO` | La respuesta guardada + cabecera `Idempotent-Replay: true`, **sin ejecutar** de nuevo |
| Misma clave, `requestHash` **distinto** (cualquier estado) | `422` `application/problem+json` |
| Misma clave, mismo hash, `PROCESANDO` | `409` + `Retry-After: 1` |

## Reserva atomica (sin carreras)

- DynamoDB: `PutItem` con `ConditionExpression: attribute_not_exists(pk) OR expiresAt < :ahora`.
- SQL (PostgreSQL): `INSERT ... ON CONFLICT (key) DO UPDATE ... WHERE expires_at < now()`; solo la sesion que inserta (o toma una
  fila vencida) obtiene la reserva. El TTL de DynamoDB puede tardar horas en borrar: por eso la expiracion **tambien se
  comprueba al leer** (`expiresAt < ahora` equivale a clave inexistente).

## Fallos durante el procesamiento (decision)

| Resultado del handler | Que se hace con la clave |
|---|---|
| Respuesta `2xx` / `3xx` | `COMPLETADO` con la respuesta |
| Respuesta `4xx` (error de negocio o validacion; es determinista) | `COMPLETADO` con esa respuesta: reintentar con la misma clave y el mismo cuerpo devuelve el mismo error |
| `5xx` o excepcion no controlada | **Se libera la clave** (se borra): el cliente puede reintentar con la misma clave. Asi un fallo transitorio no deja la clave atascada ni cachea un error |
| El proceso muere a mitad | La reserva queda `PROCESANDO` hasta expirar (24 h) -> `409` mientras tanto. Es el compromiso de no ejecutar dos veces una operacion de efectos desconocidos |

## Consumidores de RabbitMQ

Deduplican por `id` del sobre en `processed_messages` (DynamoDB `processed_messages` / `ms8_processed_messages`, SQL en MS6):

- `PROCESANDO` con arrendamiento (`lockedUntil`, 60 s): si el consumidor muere, otro puede retomar el mensaje al vencer el arrendamiento.
- `COMPLETADO` (conservado 7 dias): una reentrega se descarta (ack) sin ejecutar el handler.
- Si el handler falla se libera el id para que el reintento lo ejecute.

## Ejemplo con curl

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/sigec/protocol/openid-connect/token \
  -d grant_type=password -d client_id=sigec-shell -d username=recepcion -d 'password=Sigec123!' | jq -r .access_token)
KEY=$(uuidgen)
curl -i -X POST http://localhost:8090/api/pacientes -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Ana","documento":"D-1","fechaNacimiento":"1990-05-01"}'      # 201
# Repetir EXACTAMENTE lo mismo -> 201 con "Idempotent-Replay: true" y el mismo cuerpo (no se crea otro paciente)
# Mismo KEY con otro cuerpo -> 422 ; sin cabecera -> 400
```
