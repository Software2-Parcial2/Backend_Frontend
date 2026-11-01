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
