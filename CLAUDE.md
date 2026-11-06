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
| **L5** | MS7: voz (Whisper), dashboard Vue, `scripts/e2e-ms7.sh` | Hecho; **E2E 37/37 en stack real** (ver `docs/inteligencia.md`) |

## Donde estamos

Bloques 0-L terminados en el repo (commits locales, sin push). **Pendiente de verificar con credenciales o hardware que no hay aqui:**
1. `scripts/e2e-imagenes.sh` (bloque K): ejecutarlo; si el puerto 5432 esta ocupado usa `POSTGRES_HOST_PORT=5440 POSTGRES_PORT=5440 DB_PORT=5440` (ver `docs/PENDIENTES.md`).
2. Entrenar los modelos reales: `ml/pneumonia/train.py` y `ml/no-show/train.py` (ambos piden `~/.kaggle/kaggle.json`; los modelos actuales son sinteticos / `stub-no-clinico`).
3. Probar Gemini y Claude reales (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `LLM_PROVIDER`) y el microfono real en el navegador.
4. Mailtrap y Telegram reales (bloque J).

## Siguientes fases (inferidas, no hay plan escrito)

- **MS4 Historias clinicas:** solo esqueleto; falta dominio y casos de uso (y vincular resultados de MS5).
- **MS7:** mensajeria/idempotencia (no las usa), registrar asistencia en MS3 para entrenar el modelo de inasistencia con datos propios, pantalla integrada en el shell.
- **Frontends:** pantallas de negocio, PWA offline de datos, iconos PNG, `expo prebuild --clean`, lint de la PWA (TS 7), validador local TFLite/TF.js.
- **AWS:** desplegar y probar la Lambda `lambda-outbox`.
- **Deudas:** `paciente.actualizado`, fila de MS2 para el paciente demo, Ajv en MS6/Spring, fijar version de n8n y Postgres 17.
