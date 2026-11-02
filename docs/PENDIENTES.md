# Pendientes y problemas encontrados

Cada entrada indica bloque, comando, error y que se probo.

## Bloque C - Laravel (MS6)

- **Extensiones PHP `gd` y `bcmath` no instaladas.** Comando: `php -m | grep -iE "^(gd|bcmath)$"` no devuelve nada.
  `gd` hace falta para imagenes en PDFs de dompdf; `bcmath` solo si se usa aritmetica de precision. No se instalan paquetes del sistema:
  en Fedora, `sudo dnf install php-gd php-bcmath` (lo ejecuta el usuario).
- `./vendor/bin/pest --init` queda esperando una respuesta interactiva y no termina en modo no interactivo; `tests/Pest.php` se genero igualmente.
- Las migraciones por defecto de Laravel (`users`, `cache`, `jobs`) siguen aplicadas aunque MS6 no las usa (sesion y cache en `array`, cola en RabbitMQ). Pueden eliminarse cuando se confirme.

## Bloque E - Frontends

- **`pnpm lint` en `apps/pwa-paciente` falla** (ya fallaba antes de este bloque): `typescript-eslint does not support TS 7.0`.
  El proyecto usa `typescript ~7.0.2`. Opciones: fijar `typescript` a 6.x en esa app o esperar soporte de typescript-eslint para TS 7.x.
- **`apps/mobile`**: `app.json` ya tiene `scheme: sigec` y `com.sigec.mobile`, pero las carpetas generadas `ios/` y `android/`
  (ignoradas por Git) conservan `com.anonymous.mobile`. Hay que regenerarlas con `npx expo prebuild --clean` antes de compilar. No se compilo el movil.
- **Verificacion en navegador**: se hizo con Firefox 159 (headless, via puppeteer-core/WebDriver BiDi). No se probo en Chrome/Edge/Safari.
  El remoto Angular depende de import maps dinamicos: en el shell se usa `es-module-shims` en modo shim.
- **Native Federation en dev**: el servidor de `ng serve` responde `Access-Control-Allow-Origin: *`; la opcion `headers` anadida en `angular.json` no tiene efecto visible.
- **PWA offline**: solo hay service worker (generateSW), manifest y el indicador "en linea / sin conexion". La logica offline de datos queda pendiente.
  El manifest usa un icono SVG; para instalar en todos los navegadores hacen falta iconos PNG de 192 y 512 px.
  El estado "sin conexion" se verifico disparando el evento `offline` del navegador, no cortando la red real.
- **Keycloak**: `sslRequired: none` y `directAccessGrantsEnabled: true` en los 3 clientes son solo para desarrollo.

## Bloques F-I - Mensajeria, idempotencia, outbox y SAGA

Todo lo de estos bloques esta implementado y verificado (suites verdes y `make e2e-saga`: 51/51). Queda pendiente o conviene revisar:

**Desviaciones respecto a lo pedido**
- **Tablas de MS8 con prefijo `ms8_`** (`ms8_idempotency_keys`, `ms8_outbox`, `ms8_processed_messages`): MS3 y MS8 comparten la misma instancia de
  DynamoDB (y la misma cuenta en AWS), asi que no pueden llamarse igual. Los nombres se configuran por entorno (`IDEMPOTENCY_TABLE`, `OUTBOX_TABLE`, `PROCESSED_TABLE`).
- **Relay de Spring (MS2/MS4) sin puerto de aplicacion:** `OutboxRelay` es un adaptador de infraestructura (lee la tabla, publica, marca); no hay
  caso de uso en `application` porque no tiene logica de negocio.
- **DynamoDB Local como root** (`user: root` en el compose) por permisos del volumen nuevo. Solo desarrollo.
- **Indice `gsi1` en la tabla `citas`** (disperso: plazos de SAGA y notificaciones pendientes). No estaba en la peticion; hace que el barrido no haga Scan.

**Limitaciones conocidas**
- Notificaciones: el envio real (n8n / Mailtrap / Telegram) no existe; MS8 usa un adaptador **simulado** (`SimulatedSender`).
- La Lambda `lambda-outbox` se compila (`npm run build`) y se prueba con el poller local, pero **no se ha desplegado ni probado en AWS** (ni el event source
  mapping con `ReportBatchItemFailures`). El poller local guarda el checkpoint en `/tmp` y asume pocos shards.
- Las pruebas de fallo de RabbitMQ/backoff de los relays de Spring y Laravel son manuales (`scripts/test-outbox.sh`); no hay prueba automatica del backoff.
- Idempotencia de consumidores: el arrendamiento (`PROCESANDO`, 60 s) asume handlers mas rapidos que eso.
- Si el proceso muere con una clave de `Idempotency-Key` en `PROCESANDO`, queda bloqueada hasta que expira (24 h): compromiso documentado en `contracts/idempotency.md`.
- `scripts/e2e-saga.sh` detiene los servicios que arranca y tarda ~4 min; usa horarios aleatorios (nunca limpia DynamoDB).
- MS5 y MS7 todavia no usan mensajeria ni idempotencia.

## Bloque 0 (seguridad y calidad)

Hecho: claim `paciente_id` (realm + MS2/MS3/MS6), listados de citas por indices con cursor, validacion Ajv de cada mensaje contra su schema
(Nest: publicador y consumidores; mensaje invalido -> DLQ con el motivo) y `make dlq-replay`. Observaciones y limites:

- **Realm recreado:** para activar el perfil de usuario con `paciente_id` hubo que borrar el realm `sigec` (API de administracion) y reimportarlo desde
  `infra/keycloak/realm-sigec.json`. Cualquier usuario creado a mano en ese realm se perdio; el JSON es la fuente de verdad.
- El usuario `paciente` apunta al `paciente_id` fijo `a0000000-0000-4000-8000-000000000001`. **No existe una fila en MS2** con ese id (MS2 genera los ids);
  para datos coherentes habria que sembrarla o dar de alta pacientes con el id del usuario Keycloak.
- El rol `medico` ve todas las citas (necesita ver agendas); no hay vinculo `medico_id` con el usuario, asi que no se restringe a "sus" citas.
- Las citas anteriores a los indices se rellenaron con `make dynamodb-init` (idempotente). El indice general `gsi4` usa una unica particion (`CITA`): vale
  para este volumen; con mucho trafico habria que repartirla por mes.
- La validacion Ajv solo existe en Nest. MS6 (PHP) y Spring validan el sobre pero no el payload por schema.
- Un backlog de mensajes venenosos retrasa el consumidor de MS6 (~1 s por fallo, por el log de la excepcion); no lo bloquea. Hay que revisar las DLQ.
- `dlq-replay` mueve mensajes a la cola original por el exchange por defecto; no filtra por tipo ni por id.

## Bloque J - Notificaciones con n8n

Hecho y verificado: `make n8n-import`, 4 workflows (25 comprobaciones en un n8n real), MS8 con adaptador n8n/reintentos/FALLIDA/alertas/vinculacion/recordatorios
y `scripts/e2e-notificaciones.sh` (29). **Lo que NO se pudo verificar en este entorno (sin credenciales en `.env`):**

- **Mailtrap real:** el workflow usa `POST {MAILTRAP_API_URL}/api/send/{inbox_id}` con `Authorization: Bearer`. Se probo contra un servidor simulado con ese contrato, no
  contra la API real; la Parte 2 de `e2e-notificaciones.sh` (correo visible en la bandeja y verificado por la API de Mailtrap) queda **omitida** hasta tener `MAILTRAP_*`.
  La URL/cabecera de busqueda de mensajes de esa verificacion tampoco esta probada.
- **Telegram real:** `scripts/test-telegram.sh` sale con "OMITIDA" sin `TELEGRAM_BOT_TOKEN`. El sondeo `getUpdates`, el `sendMessage` y la vinculacion `/start <codigo>` solo se probaron con el simulado.
  No uses un webhook de Telegram para el mismo bot (compite con `getUpdates`).

**Limitaciones y decisiones**
- El contacto del paciente (email) se toma del evento `paciente.creado` (se amplio con `email`). **No hay `paciente.actualizado`**: un cambio de email en MS2 no llega a MS8. Pacientes creados antes de este
  cambio no tienen contacto en MS8 (sus notificaciones fallan con "sin canal de contacto" hasta recibirlo).
- Los recordatorios se alimentan del evento `cita.confirmada` (nuevo): las citas confirmadas **antes** de este bloque no se recuerdan. Una cita no se "des-confirma", asi que no hay cancelacion de recordatorios.
- El recordatorio se envia una vez por cita; si falla, lo reintenta el barrido de PENDIENTES (no el workflow horario).
- n8n usa `n8nio/n8n:latest` (sin fijar version) y avisa de que Postgres 16 "recibe soporte de compatibilidad". Conviene fijar version y subir a Postgres 17 mas adelante.
- Activar workflows importados requiere reiniciar n8n (`make n8n-import` lo hace). Cualquier edicion en la interfaz debe volver al repo con `make n8n-export`.
- El monitor de DLQ de MS8 alerta por crecimiento de cualquier `*.dlq`; no distingue gravedad ni agrupa alertas repetidas.
- La vinculacion de Telegram no verifica que el `chatId` sea de una persona (cualquiera con un codigo valido se vincula); el codigo es de un solo uso y dura 10 min.
- Se corrigio un fallo real del consumidor de Laravel (consumidores huerfanos al reconectar por inactividad) que dejaba mensajes sin atender.

## Bloque K - MS5 imagenes e inferencia

Hecho: API Nest (subida con firma real, S3, Mongo, URL prefirmada, comandos/resultados por RabbitMQ), inferencia FastAPI con consumidor y DLQ,
`train.py`/`convertir.py`, `scripts/e2e-imagenes.sh`, `docs/imagenes-ia.md`. Verificado: `pnpm --filter ms5-api test` (22 ok, 4 omitidas) y `pytest` de inferencia (25 ok).

- **`scripts/e2e-imagenes.sh` NO se ha ejecutado:** el stack estaba apagado y el puerto 5432 lo ocupaba el Postgres de otro proyecto (`emprendeu-db-1`),
  asi que `docker compose up` de SIGEC habria chocado. Ejecutarlo antes de dar el bloque por cerrado.
- **No hay modelo real entrenado:** solo el humo sintetico en `ml/pneumonia/` (no clinico). Faltan credenciales de Kaggle (`~/.kaggle/kaggle.json`);
  entrenamiento completo con el comando de `docs/imagenes-ia.md`. Mientras tanto la inferencia responde `modelo: "stub-no-clinico"`.
- Las 4 pruebas omitidas de la API (Mongo/S3 reales) requieren el stack levantado.
- `ml/.venv-tfjs/` y los `.keras`/`.tflite` estan en `.gitignore`.

## Bloque L - MS7 inteligencia

### L1 - Modelos de ML (services/ms7-inteligencia/ml)
Hecho: API FastAPI (`/predict/no-show`, `/segments/demanda`, `/model/info`), `ml/no-show/train.py`, `ml/demanda/segmentar.py`,
`scripts/seed/citas-sinteticas.mjs`, Dockerfile y 12 pruebas (`pytest`). Ver `services/ms7-inteligencia/ml/README.md`.

- **El Random Forest NO esta entrenado con datos reales:** no hay credenciales de Kaggle en este entorno (`~/.kaggle/kaggle.json`). El script falla con un mensaje claro
  sin ellas. Solo existe un modelo de humo con datos **sinteticos** (`rf-noshow-...-sintetico`, AUC ~0.6, sin valor predictivo) para probar el flujo; `sintetico: true` aparece en cada respuesta.
  Las metricas reales (precision/recall/F1/AUC e importancias) se generaran al ejecutar `ml/no-show/train.py`.
- **`scripts/seed/citas-sinteticas.mjs` no se ha ejecutado** (stack de SIGEC apagado; el puerto 5432 lo ocupa otro proyecto). MS3 solo acepta fechas futuras, asi que las citas
  sembradas son de los proximos meses (no historicas). Arranca MS8 con `NOTIF_SENDER=simulated` al sembrar. La segmentacion se probo con el generador interno `--fuente sintetico`.
- K-means: con datos sinteticos la silueta es baja (~0.2); es esperable con observaciones especialidad-semana ruidosas. Con datos reales conviene revisar `evaluacion_k`.
- No hay estado "asistio / no asistio" en MS3: el modelo de inasistencia solo puede entrenarse con el dataset externo; para usarlo con citas de SIGEC faltan `edad`, `beca` y el historial por paciente (MS2/MS3).

### L2 - API de MS7 y GraphQL
Hecho: `/graphql` (code-first, Apollo 5) con `resumenCitas`, `ingresos`, `demandaEspecialidades`, `riesgoInasistencia` y `citas` paginadas por cursor;
`GestionService` (casos de uso compartidos con el MCP de L3); endpoint `GET /api/facturacion/facturas/ingresos` nuevo en MS6 (con pruebas); soporte de contexto
GraphQL en `@sigec/auth-nest` (`requestOf`). Pruebas: 21 en ms7-api (unitarias + integracion con JWT firmados por un JWKS local) y 26 de facturas en MS6.

**Decision de identidad:** se **propaga el token del usuario** a MS3/MS6 (cada servicio vuelve a validarlo y aplica su propia regla por rol). Asi MS7 no tiene privilegios propios
ni necesita una cuenta de servicio en Keycloak, y la auditoria ve al usuario real. Solo se justificaria una cuenta de servicio para tareas sin usuario (informes programados), que aun no existen.

- **No probado contra el stack real** (Keycloak/MS3/MS6/ML apagados). Las integraciones HTTP (`clients/*.ts`) solo se verificaron con dobles; ejecutar con el stack levantado.
- **El riesgo de inasistencia usa atributos estimados:** SIGEC no registra `edad`, `beca` ni asistencia previa en MS3; se envian valores neutros (`edad=35`, `beca=false`, `inasistencias_previas=0`) y la respuesta lo declara en
  `atributosEstimados`. `citas_previas` se cuenta solo dentro del lote. Para predicciones utiles hay que traer la edad desde MS2 y registrar asistencia (estado "NO_ASISTIO").
- **El resumen de citas lee MS3 paginando** (hasta 5000 citas, `truncado: true` si se corta) y filtra por fecha en MS7: MS3 solo filtra por rango con `medicoId`. Un endpoint agregado en MS3 seria mas eficiente.
- **Ingresos por especialidad no existe:** MS6 no conoce la especialidad (solo `cita_id`); habria que cruzar con MS3.
- GraphQL responde HTTP 200 con `errors` (401/403 dentro de `extensions`), como es habitual; el gateway ya enruta `/graphql` a MS7.
- Limites: profundidad 6 y 120 campos (`GRAPHQL_MAX_DEPTH`/`GRAPHQL_MAX_COMPLEXITY`); la complejidad cuenta campos, no multiplica por el tamano de las listas.
- Se anadieron las dependencias `dataloader` y `@as-integrations/express5` (necesaria para `@nestjs/apollo` con Express 5).

### L3 - Servidor MCP y agente
Hecho: servidor MCP (`@modelcontextprotocol/sdk`, transporte **en memoria**: agente y herramientas viven en el mismo proceso; stdio exigiria un proceso hijo por consulta y HTTP un puerto
extra que proteger; cambiar el transporte permite publicar el mismo servidor a otros clientes MCP), 6 herramientas de solo lectura con zod, adaptadores Gemini/Claude/simulado
(`LLM_PROVIDER`), bucle con limites (iteraciones, tiempo, llamadas por turno, consultas/hora por usuario), auditoria, redaccion, reportes (spec JSON zod -> JSON/xlsx/csv/pdf),
`POST /api/inteligencia/agente/consulta`, `POST /api/inteligencia/reportes?formato=`, `GET /api/inteligencia/agente/auditoria`. 72 pruebas en ms7-api.

- **Los proveedores reales (Gemini, Claude) NO se probaron contra su API:** no hay `GEMINI_API_KEY` ni `ANTHROPIC_API_KEY` en este entorno. Los adaptadores se verificaron con clientes simulados
  del SDK (traduccion de mensajes, herramientas, llamadas, `AbortSignal`). Hay una prueba real opcional (`describe.skipIf`) que corre sola si defines `GEMINI_API_KEY`.
  Los ids de modelo por defecto (`gemini-2.5-flash`, `claude-sonnet-5-5`) son configurables (`GEMINI_MODEL`, `CLAUDE_MODEL`); revisa que sigan vigentes.
- **`consultar_politicas` aun no tiene RAG:** responde "no se encontro informacion suficiente" hasta L4.
- La auditoria y el limite de uso estan **en memoria** (se pierden al reiniciar y no se comparten entre replicas). Para produccion: tabla en PostgreSQL / Redis.
- La defensa contra inyeccion de prompts es por capas (delimitadores + regla en el prompt + lista blanca por rol + solo lectura + zod + redaccion), pero ninguna es infalible con un LLM real;
  las pruebas verifican las capas deterministas con un modelo simulado que "obedece" ordenes maliciosas. Conviene un conjunto de pruebas adversariales con el modelo real.
- El proveedor `simulated` (palabras clave) es un doble de pruebas, no un modelo; no lo uses en produccion.
- Los reportes de riesgo de inasistencia heredan la limitacion de L2 (atributos estimados) y el modelo actual es sintetico.
- Limite de filas por reporte: 1000 (PDF: 500). Las descargas se generan en memoria.
