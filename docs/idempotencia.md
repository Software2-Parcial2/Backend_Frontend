# Idempotencia - guia de uso y pruebas

El contrato esta en [`contracts/idempotency.md`](../contracts/idempotency.md). Aqui, como se implementa en cada servicio y como probarlo.

| Servicio | Implementacion | Almacen |
|---|---|---|
| MS3 / MS8 (Nest) | `@Idempotent()` de `packages/idempotency-nest` (interceptor, va despues de los guards) | DynamoDB `idempotency_keys` / `ms8_idempotency_keys` (TTL en `expiresAt`) |
| MS2 / MS4 (Spring) | `IdempotencyFilter` en la cadena de seguridad, tras la autorizacion; aplica a todo POST/PUT/PATCH de `/api/**` | PostgreSQL `idempotency_keys` (Flyway `V2`) |
| MS6 (Laravel) | middleware `idempotent` (tras `keycloak.jwt` y `role`) | PostgreSQL `idempotency_keys` |
| Consumidores RabbitMQ | `MessageDeduplicator` por `id` del mensaje | DynamoDB `processed_messages` / SQL `processed_messages` |

Aplicado a: `POST /api/pacientes` (MS2), `POST /api/citas` (MS3), `POST /api/facturacion/facturas` (MS6).

## Como ejecutar las pruebas

```bash
# Paquete Nest (reglas, interceptor con peticiones simultaneas y DynamoDB Local real)
pnpm --filter @sigec/idempotency-nest test
# Spring (Testcontainers; incluye concurrencia con hilos, expiracion y liberacion ante 5xx)
(cd services/ms2-pacientes && ./mvnw test) ; (cd services/ms4-historias && ./mvnw test)
# Laravel (usa la base ms6_facturacion_test; incluye una carrera entre 6 procesos)
(cd services/ms6-facturacion && php artisan test)
# Prueba con curl por el gateway
docker compose up -d && make dynamodb-init
scripts/dev-services.sh start gateway ms2 ms3 ms6
scripts/test-idempotencia.sh
```

## Notas

- La clave se acota por usuario (`sub`): `<sub>:<Idempotency-Key>`.
- Una respuesta guardada se reproduce con el codigo HTTP del endpoint original y la cabecera `Idempotent-Replay: true`.
- Un `5xx` libera la clave; un `4xx` se conserva (es determinista). Detalle y motivos en el contrato.
- El gateway expone `Idempotent-Replay`, `Retry-After` y `Location` en `Access-Control-Expose-Headers`.
