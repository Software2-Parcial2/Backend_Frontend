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
| K | MS5 imagenes e inferencia de radiografias (`29a7a0f`) | Codigo, docs y pruebas unitarias hechos; **E2E `e2e-imagenes.sh` sin ejecutar** |
| L1 | MS7: modelos de ML (inasistencia, K-means) y API FastAPI | Hecho; Random Forest solo con datos **sinteticos** (faltan credenciales de Kaggle) |
| L2 | MS7: GraphQL de gestion + endpoint de ingresos en MS6 | Hecho |
| L3 | MS7: servidor MCP, agente (Gemini/Claude/simulado), reportes xlsx/csv/pdf | Hecho; **LLM reales sin probar** (faltan API keys) |
| L4 | MS7: RAG con pgvector + servicio de embeddings | Hecho; recuperacion medida 10/12 en top-1 |
| **Datos** | Auditoria y modelo de datos (`docs/datos/`): migraciones ms2/ms4/ms6/ms7, disponibilidad de horarios (Query), `mongo-init`, semilla, EXPLAIN, diccionario generado | Hecho; ver `docs/PENDIENTES.md` (bloque Datos) |
| **Docker** | Pila completa en contenedores (`docker-compose.full.yml`, `make up-core`/`up-all`, `docs/docker.md`) | Hecho y verificado con `up-core`; **ML (`up-all`) y navegador sin verificar** |
| **Diseno** | Diseno visual trasladado a los frontends: `packages/design-tokens`, `design.md` por app, pantallas clave con datos de ejemplo | Hecho: todas las pantallas del diseno; shell+remotos verificados en Chromium con Keycloak; PWA/movil solo compilados (ver `docs/PENDIENTES.md`) |
| **Backend limpio** | Plan de 10 fases (docs/api.md): convenciones comunes (problem+json, cursor, camelCase, OpenAPI + api-types), MS2 catalogo y edicion, MS3 cancelar/reprogramar/horarios/asistencia, MS6 pagos y caja, MS4 historias clinicas, MS5 validacion de estudios, MS8 historial/plantillas, MS7 alertas, nuevo `ms1-identidad` | Hecho; **`scripts/e2e-flujos.sh` 88/88**; ver `docs/PENDIENTES.md` (Fases 0-9). |
| **L5** | MS7: voz (Whisper), dashboard Vue, `scripts/e2e-ms7.sh` | Hecho; **E2E 37/37 en stack real** (ver `docs/inteligencia.md`) |
| **Frontends conectados** | `packages/api-client` + `apiUrl` en `mount()`; shell, remoto Angular (todas las pantallas), remoto Vue, PWA en linea y sin conexion (cola con `Idempotency-Key`), app movil | Hecho; **`node scripts/e2e-frontends/index.mjs` = 199/199** en navegador real y `e2e-flujos.sh` 88/88; **la app movil solo esta compilada (`tsc`, `expo export`), sin probar en dispositivo**. Ver `docs/frontends-conexion.md` y `docs/PENDIENTES.md` |

## Donde estamos

Bloques 0-L, el backend limpio y la conexion de los frontends terminados en el repo (commits locales, sin push). **Pendiente de verificar con credenciales o hardware que no hay aqui:**
1. `scripts/e2e-imagenes.sh` (bloque K): ejecutarlo; si el puerto 5432 esta ocupado usa `POSTGRES_HOST_PORT=5440 POSTGRES_PORT=5440 DB_PORT=5440` (ver `docs/PENDIENTES.md` y `docs/frontends-conexion.md`).
2. Entrenar los modelos reales: `ml/pneumonia/train.py` y `ml/no-show/train.py` (ambos piden `~/.kaggle/kaggle.json`; los modelos actuales son sinteticos / `stub-no-clinico`; las importancias del Random Forest llegan `null`).
3. Probar Gemini y Claude reales (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `LLM_PROVIDER`) y el microfono real en el navegador.
4. Mailtrap y Telegram reales (bloque J).
5. **App movil** en emulador/dispositivo: `expo prebuild --clean`, login nativo contra Keycloak (`10.0.2.2`), SQLite, SecureStore; subir estudios (falta `expo-image-picker` y el validador TFLite).

## Al actualizar el repo (backend)

Ejecutar en este orden: `make dynamodb-init rabbitmq-declare mongo-init`, definir `MS1_CLIENT_SECRET`/`MS7_CLIENT_SECRET` en `.env` y `make keycloak-aplicar`, y **volver a iniciar sesion** (los tokens ahora llevan `sub` y los servicios Nest lo exigen).

## Siguientes fases (inferidas, no hay plan escrito)

- **Frontends:** pruebas de componentes del remoto Angular, migrar los tipos escritos a mano a `@sigec/api-types`, validador local TFLite/TF.js (carga de estudios), iconos PNG de la PWA, lint de la PWA (TS 7), `beforeinstallprompt`.
- **MS7:** mensajeria/idempotencia (no las usa), registrar asistencia en MS3 para entrenar el modelo de inasistencia con datos propios; vinculo de Telegram del personal.
- **AWS:** desplegar y probar la Lambda `lambda-outbox`.
- **Deudas:** `paciente.actualizado`, fila de MS2 para el paciente demo, Ajv en MS6/Spring, fijar version de n8n y Postgres 17.
