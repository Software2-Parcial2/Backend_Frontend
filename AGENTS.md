# SIGEC - Sistema Integral de Gestión de Clínicas

Monorepo del curso Ingeniería de Software II (UAGRM). Microservicios en varios lenguajes, frontends con microfrontends y una capa de inteligencia (ML, RAG, voz).

## Arquitectura

DDD + Arquitectura Hexagonal + Clean Architecture en cada servicio.

- **Identidad:** Keycloak (realm `sigec`; clientes `sigec-shell`, `sigec-pwa`, `sigec-mobile` con PKCE). No existe un MS1: cada servicio solo valida el JWT. Los roles vienen en `realm_access.roles` (`administrador`, `medico`, `recepcion`, `caja`, `paciente`).
- **Gateway:** Spring Cloud Gateway (webmvc), solo expone `/api/**`.
- **Mensajería:** RabbitMQ. SAGA orquestada por MS3 (reserva de cita → cobro provisional en MS6 → notificación en MS8, con compensaciones).
- **Outbox:** tabla `outbox` en PostgreSQL para MS2/MS4/MS6; DynamoDB Streams + Lambda para MS3/MS8.
- **Idempotencia:** cabecera `Idempotency-Key` en operaciones de escritura.
- **Datos:** PostgreSQL (una base por servicio + keycloak + n8n; pgvector en `ms7_inteligencia`), MongoDB (metadatos de imágenes), DynamoDB (citas, claves de idempotencia, notificaciones), S3 local con SeaweedFS.
- **Frontends:** shell React (Rsbuild + Module Federation) que carga remotos Angular (Native Federation) y Vue; PWA React offline; app móvil React Native (Expo, dev build). GraphQL solo en el módulo de gestión de MS7.

## Servicios y puertos

| Pieza | Tecnología | Puerto |
|---|---|---|
| Keycloak | Keycloak 26 | 8080 |
| Gateway | Spring Cloud Gateway | 8090 |
| MS2 Pacientes | Spring Boot 4, Java 21 | 8082 |
| MS3 Citas | NestJS | 3003 |
| MS4 Historias clínicas | Spring Boot 4, Java 21 | 8084 |
| MS5 Imágenes (API) | NestJS | 3005 |
| MS5 inferencia | FastAPI + TensorFlow | 8005 |
| MS6 Facturación | Laravel (PHP) | 8006 |
| MS7 Inteligencia (API) | NestJS | 3007 |
| MS7 ml / whisper | FastAPI | 8007 / 8017 |
| MS8 Notificaciones | NestJS | 3008 |
| PostgreSQL | pgvector pg16 | 5432 |
| MongoDB | mongo 7 | 27017 |
| DynamoDB local | amazon/dynamodb-local | 8000 |
| S3 local | SeaweedFS | 9000 |
| RabbitMQ | AMQP / consola | 5672 / 15672 |
| n8n | n8n | 5678 |
| shell / PWA / remote-vue / remote-angular | Rsbuild / Vite / Vite / Angular | 5173 / 5174 / 5175 / 4201 |

### Paquetes compartidos (`packages/`)

| Paquete | Uso |
|---|---|
| `@sigec/auth-nest` | guard JWT de Keycloak (`jose`), `@Public()`, `@Roles()`, `@CurrentUser()` |
| `@sigec/messaging-nest` | sobre de mensajes, publicador con confirms, consumidor con reintentos/DLQ, `buildOutboxItem` |
| `@sigec/idempotency-nest` | `@Idempotent()` (interceptor), almacen DynamoDB, deduplicador de consumidores |
| `@sigec/mfe-contract` | tipos del contrato `mount/unmount` de los microfrontends |

## Reglas de capas

```
src/{domain, application, infrastructure}
```

- `domain`: no depende de nada (ni frameworks ni otras capas).
- `application`: solo depende de `domain` (casos de uso, puertos de entrada y salida).
- `infrastructure`: depende de `application` y `domain` (adaptadores web, persistencia, mensajería, configuración).

En los servicios Spring esto se verifica con ArchUnit.

## Infraestructura local

```bash
cp .env.example .env     # y cambia las contraseñas
docker compose up -d
docker compose ps
```

El realm de Keycloak se importa desde `infra/keycloak/` y el script `infra/postgres/init.sql` crea las bases. Si cambias `init.sql` hay que recrear el volumen: `docker compose down -v`.

## Token de Keycloak para pruebas

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/sigec/protocol/openid-connect/token \
  -d grant_type=password -d client_id=sigec-shell \
  -d username=recepcion -d 'password=Sigec123!' | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/pacientes
```

Usuarios de prueba: uno por rol (`recepcion`, `medico`, ...), contraseña `Sigec123!`. Solo para desarrollo.

## Convenciones de commits (en español)

Formato `tipo(ámbito): descripción en imperativo`, en minúsculas y sin punto final.

- Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`.
- Ámbito: servicio o app (`gateway`, `ms2`, `ms3`, `shell`, `infra`...).
- Ejemplo: `feat(ms2): crear paciente con escritura en outbox`.
- Un cambio lógico por commit; no mezclar servicios sin motivo.

## Mensajeria, idempotencia y outbox (reglas)

- **Contratos:** todo mensaje de RabbitMQ cumple el sobre comun (`id`, `type`, `occurredAt`, `correlationId`, `causationId`, `version`,
  `payload`) y tiene su JSON Schema en `contracts/events/`. La topologia (exchanges, colas, DLQ, colas de espera) esta en
  `contracts/events/topology.json`; `make rabbitmq-declare` la declara y cada servicio declara sus colas al arrancar.
  Un cambio de mensaje = cambiar su schema + README + los productores/consumidores.
- **Publicar:** mensajes persistentes, con publisher confirms. **Consumir:** ack manual, reintentos limitados (colas de espera 5 s / 30 s / 2 min,
  3 reintentos) y DLQ; deduplicar siempre por `id` del mensaje (`processed_messages`).
- **Outbox:** un evento o comando que debe salir **nunca** se publica directamente: se escribe en la tabla/item `outbox` en la misma transaccion que
  el cambio de negocio (SQL: MS2/MS4/MS6; DynamoDB `TransactWriteItems` con `buildOutboxItem`: MS3/MS8). Un relay lo publica al menos una vez
  (`docs/outbox.md`). El `id` del sobre es el id de la fila del outbox.
- **Idempotencia HTTP:** `Idempotency-Key` (UUID) obligatoria en POST/PUT/PATCH de negocio (`contracts/idempotency.md`, `docs/idempotencia.md`).
  Respuestas: `400` sin cabecera, `422` mismo key con otra peticion, `409` + `Retry-After` en proceso, replay con `Idempotent-Replay: true`.
- **SAGA de citas:** orquestada por MS3 (`docs/saga-citas.md`). La maquina de estados (`application/saga/saga-machine.ts`) es pura y sin framework;
  la persistencia aplica cada transicion en una sola transaccion (cita + saga + horario + outbox).
- **CORS solo en el gateway.** Ningun otro servicio lo activa.

## Pruebas

| Que | Comando |
|---|---|
| Spring (Testcontainers; necesita Docker) | `(cd services/ms2-pacientes && ./mvnw test)` y `ms4-historias` |
| Laravel MS6 (BD `ms6_facturacion_test`) | `(cd services/ms6-facturacion && php artisan test)` |
| Nest (unitarias + DynamoDB Local) | `pnpm --filter ms3-citas test`, `ms8-notificaciones`, `ms5-api`, `ms7-api` |
| Paquetes compartidos | `pnpm --filter @sigec/messaging-nest test` (usar `set -a; source .env; set +a` para el RabbitMQ real), `@sigec/idempotency-nest`, `@sigec/auth-nest` |
| Lambda del outbox | `(cd services/ms3-citas/lambda-outbox && set -a && source ../../../.env && set +a && npm test)` |
| Idempotencia por el gateway (curl) | `scripts/dev-services.sh start gateway ms2 ms3 ms6 && scripts/test-idempotencia.sh` |
| Relay del outbox con RabbitMQ apagado/encendido | `scripts/dev-services.sh start gateway ms2 ms6 && scripts/test-outbox.sh` |
| **SAGA de extremo a extremo** (66 comprobaciones, ~5 min) | `docker compose up -d && make dynamodb-init && make rabbitmq-declare && make e2e-saga` |

| Workflows de n8n contra proveedores simulados (25) | `make n8n-import && scripts/test-n8n-workflows.sh` |
| Notificaciones E2E con MS8 + n8n reales (29; Mailtrap real solo con credenciales) | `make n8n-import && scripts/e2e-notificaciones.sh` |
| Telegram real (token del `.env`) | `scripts/test-telegram.sh [chat_id]` |

`scripts/dev-services.sh` levanta/para servicios por puerto (`start|stop|status [gateway ms2 ms3 ms4 ms5 ms5-inference ms6 ms7 ms7-ml ms8]`, `poller-start|poller-stop`,
`workers-start|workers-stop` para el relay y el consumidor de MS6). Logs en `/tmp/sigec-logs`. `scripts/e2e-saga.sh` arranca y detiene lo que necesita.

- **Reprocesar una DLQ:** `make dlq-replay QUEUE=ms6.saga.comandos [LIMIT=10]` mueve mensajes de `<cola>.dlq` a `<cola>` conservando el id del sobre.
- **Rol paciente:** el token lleva el claim `paciente_id` (mapper en el realm). Un paciente solo ve/pide sus citas (MS3), su registro (MS2) y sus facturas (MS6);
  el acceso ajeno responde 404 (citas) o 403. Los servicios Nest lo leen en `AuthUser.pacienteId`.
- **Listados:** nunca `Scan`; consultas por indice (`gsi2` paciente, `gsi3` medico/fecha, `gsi4` general) con `limite` y `cursor` opaco (validado contra la particion).
- **Validacion de mensajes:** en Nest cada mensaje se valida con Ajv contra `contracts/events/<tipo>.schema.json` al publicar y al consumir.
  Nunca publiques pruebas de mensajes invalidos por `sigec.saga`/`sigec.eventos`: llegan a las colas reales (usa el exchange por defecto hacia una cola de prueba).

## Notificaciones (MS8 + n8n)

- MS8 decide a quien/que/cuando; n8n solo transporta (correo por Mailtrap, mensajes por Telegram). Un fallo de notificacion **nunca anula una cita**:
  queda `PENDIENTE`, se reintenta con backoff y, tras `NOTIF_MAX_INTENTOS`, pasa a `FALLIDA` con alerta interna. Ver `docs/notificaciones.md`.
- Los workflows (`infra/n8n/workflows/*.json`) **no contienen secretos**: leen `$env.X`. Importar/actualizar: `make n8n-import`.
- Secretos compartidos en `.env` (nunca en el repo): `N8N_WEBHOOK_SECRET` (MS8 -> n8n) y `MS8_INTERNAL_SECRET` (n8n -> `/internal/**` de MS8). Placeholders en `.env.example`.
- `NOTIF_SENDER=simulated` es solo un doble de pruebas; `scripts/e2e-saga.sh` lo usa para no depender de n8n.
- Las plantillas (en `plantillas.ts`) no llevan datos clinicos; Telegram, aun menos contenido que el correo.

## Trampas conocidas

- **Consumidor de Laravel:** no reconectar en cada espera inactiva (dejaba consumidores huerfanos con mensajes sin ack). Ya corregido y con prueba.
- **Offset del bot de Telegram:** n8n lo guarda entre ejecuciones; en pruebas los `update_id` deben crecer siempre (usa la hora).
- **`scripts/dev-services.sh`** respeta las variables ya exportadas (no las pisa con el `.env`).

- **Paquetes compartidos de pnpm** (`injectWorkspacePackages`): los servicios usan una copia. `pnpm build`/`test` de un servicio la resincronizan,
  pero si **anades un archivo nuevo** a un paquete hay que ejecutar `pnpm install --force --offline` en la raiz.
- **Procesos huerfanos:** lanzar un proceso con `cd d && cmd &` deja un subshell vivo y el pid guardado es el equivocado. Usa `(cd d; cmd &)`.
  Si un relay/consumidor antiguo sigue vivo con codigo viejo puede robar mensajes: `ps -eo pid,args | grep -E "artisan (outbox:relay|saga:consume)"`.
- **DynamoDB Local** corre como root en el compose (volumen persistente `dynamodb_data`, solo desarrollo). `make dynamodb-init` es repetible.
- `pkill -f` con un patron que aparece en el propio comando mata tu shell; usa `pkill -f "[p]atron"`.
- En MS6 las pruebas usan PostgreSQL (`ms6_facturacion_test`), no SQLite (las migraciones usan `jsonb`).

## Estado y pendientes

Ver `docs/PENDIENTES.md`.

