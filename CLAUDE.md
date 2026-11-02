# CLAUDE.md

Las reglas de arquitectura, puertos, comandos, convenciones de commits y pruebas estan en `AGENTS.md` (leelo primero).
Los problemas y limites conocidos por bloque estan en `docs/PENDIENTES.md`. Este archivo registra **que esta hecho y donde estamos**.

## Reglas de trabajo vigentes (del encargo original)

- Un commit local por bloque, en espanol, sin push. Si una comprobacion falla: 3 intentos y luego anotarlo en `docs/PENDIENTES.md` y seguir.
- Sin sudo. No inventar versiones. CORS solo en el gateway.
- Secretos (token de Telegram, credenciales de Mailtrap) SOLO en `.env`, nunca en el repo; placeholders en `.env.example`.
- Al terminar cada bloque, resumen por bloque.

## Estado por bloque

| Bloque | Contenido | Estado |
|---|---|---|
| 0, A | Limpieza, gateway, esqueleto | Hecho (commit `d750542`) |
| B | Keycloak, realm `sigec` | Hecho (`38732a9`) |
| C | MS2/MS4 Spring, MS6 Laravel | Hecho (`0cfb66d`, `bfd03b1`) |
| D | Servicios Nest hexagonales con JWT | Hecho (`d34061b`) |
| E | Frontends: shell, remotos Vue/Angular, PWA, movil | Esqueletos hechos (`08e8218`); sin pantallas de negocio |
| F | Contratos de eventos, topologia RabbitMQ, tablas DynamoDB | Hecho (`b89854a`) |
| G | Idempotency-Key y deduplicacion | Hecho (`47c13a5`) |
| H | Outbox y relay | Hecho (`1ca878a`) |
| I | SAGA de citas (MS3), E2E 51/51 | Hecho (`a16fc8f`) |
| 0 (seguridad) | Claim `paciente_id`, listados por indice con cursor, Ajv, `make dlq-replay` | Hecho (`255500b`) |
| J | Notificaciones MS8 + n8n (Mailtrap, Telegram) | Hecho (`ec47522`); Mailtrap/Telegram reales sin verificar (faltan credenciales) |
| **K** | MS5 imagenes e inferencia de radiografias | Codigo, docs y pruebas unitarias hechos y commiteados; **E2E sin ejecutar** (ver abajo) |

## Donde estamos: Bloque K (MS5)

Commiteado. Verificado: `pnpm --filter ms5-api test` (22 ok) y `pytest` de inferencia (25 ok). Documentado en `docs/imagenes-ia.md` y `docs/PENDIENTES.md`.

**Falta**
1. Ejecutar `scripts/e2e-imagenes.sh`. No se pudo: el stack de SIGEC esta apagado y el puerto 5432 lo ocupa `emprendeu-db-1` (otro proyecto).
   Hay que parar ese contenedor (o cambiar el puerto) y luego `docker compose up -d && make dynamodb-init rabbitmq-declare s3-init && scripts/e2e-imagenes.sh`.
2. Entrenar el modelo real (credenciales Kaggle); mientras tanto la inferencia usa `stub-no-clinico`.

## Siguientes fases (inferidas, no hay plan escrito)

- **MS4 Historias clinicas:** solo esqueleto; falta dominio y casos de uso (y vincular resultados de MS5).
- **MS7 Inteligencia:** solo carpetas (`api`, `ml`, `whisper`); falta GraphQL de gestion, ML, voz, RAG con pgvector, mensajeria e idempotencia.
- **Frontends:** pantallas de negocio, PWA offline de datos, iconos PNG, `expo prebuild --clean`, lint de la PWA (TS 7), validador local TFLite/TF.js.
- **AWS:** desplegar y probar la Lambda `lambda-outbox`.
- **Deudas:** `paciente.actualizado`, fila de MS2 para el paciente demo, Ajv en MS6/Spring, fijar version de n8n y Postgres 17,
  credenciales reales de Mailtrap/Telegram para completar la verificacion del bloque J.
