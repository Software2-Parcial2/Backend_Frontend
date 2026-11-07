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
- **`scripts/seed/citas-sinteticas.mjs`** se ejecuto despues (bloque L5) contra el stack real: 595 citas creadas por la API. MS3 solo acepta fechas futuras, asi que las citas
  sembradas son de los proximos meses (no historicas). Arranca MS8 con `NOTIF_SENDER=simulated` al sembrar. La segmentacion `--fuente ms3` funciono y destaco el problema de los valores atipicos (ver L5).
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

### L4 - RAG sobre documentos administrativos
Hecho: 5 documentos ficticios en `docs/rag/` (marcados como ejemplo), servicio de **embeddings separado** (`services/ms7-inteligencia/embeddings`, puerto 8027), migracion versionada
(`services/ms7-inteligencia/api/migrations/0001_rag.sql`: tablas + indice HNSW coseno, vector(384)) con ejecutor propio (checksum, bloqueo asesor), ingesta con fragmentos solapados y metadatos
(documento, seccion, version), `consultar_politicas` conectada al RAG (cita documento y seccion, descarta bajo `RAG_SCORE_MINIMO`), `POST /api/inteligencia/rag/reindexar` y `GET .../estado` (administrador).

**Por que un servicio de embeddings aparte (y no reutilizar Whisper):** Whisper es CPU-intensivo y de peticiones largas (audio); el RAG necesita embeddings de baja latencia en cada consulta del agente. Con un
solo proceso una transcripcion bloquearia las consultas; ademas escalan y se reinician de forma independiente y tienen limites de entrada distintos. Comparten la misma dependencia (`sentence-transformers`), no el proceso.

**Recuperacion medida** (modelo `paraphrase-multilingual-MiniLM-L12-v2`, 12 preguntas de `test/rag.recuperacion.spec.ts`, con pgvector real): acierto en el primer resultado 10/12, entre los 3 primeros 11/12;
3 preguntas fuera de alcance (capital de Francia, receta, Unity) obtienen puntuaciones <= 0.11 y quedan por debajo del umbral 0.3 (el agente respondera que no hay informacion suficiente).
- **Limitacion conocida:** «¿Atienden los domingos?» (y «Horario de atención los domingos») no recupera la seccion «Consulta externa» (puntuaciones 0.31-0.43, gana «Atencion telefonica» / «Feriados»). Un modelo
  de embeddings mayor (p. ej. multilingual-e5) o busqueda hibrida (BM25 + vectorial) lo mejoraria. Esta registrado como `it.fails` en la prueba.
- La prueba de recuperacion solo corre con `RAG_IT=1` (necesita PostgreSQL con pgvector y el servicio de embeddings); aqui se ejecuto con un contenedor temporal `pgvector/pgvector:pg17` en el puerto 5498
  porque el puerto 5432 estaba ocupado por otro proyecto. No se ejecuto contra el PostgreSQL del compose de SIGEC.
- La primera ejecucion del servicio de embeddings descarga ~470 MB del modelo desde Hugging Face (volumen `ms7_models` en Docker; `~/.cache/huggingface` en desarrollo).
- Cambiar de modelo con otra dimension exige una migracion nueva (`vector(N)`) y `reindexar` con `forzar: true`. El cliente de MS7 rechaza dimensiones distintas de 384.
- Los documentos se leen del disco (`RAG_DOCS_DIR`, por defecto `docs/rag`); en Docker hay que montarlos. No hay control de acceso por documento: todo el RAG es visible para los roles de gestion.
- `consultar_politicas` aun no se probo con un LLM real (ver L3).

### L5 - Voz para reportes (y cierre del bloque L)
Hecho: servicio Whisper (`services/ms7-inteligencia/whisper`, faster-whisper, `POST /transcribir`, limites de 10 MB y 60 s, puerto 8017, Dockerfile), `POST /api/inteligencia/agente/voz` en MS7,
dashboard en el remoto Vue (resumen con GraphQL/Apollo + ECharts, caja de consulta, microfono con Web Speech o grabacion + Whisper, tabla/grafico del reporte, exportacion Excel/CSV/PDF, herramientas usadas),
`scripts/e2e-ms7.sh` y `docs/inteligencia.md` (diagramas Mermaid).

**Verificado en un stack real** (Keycloak, gateway, MS3, MS6, ML, embeddings, Whisper, PostgreSQL+pgvector): `scripts/e2e-ms7.sh` -> **37 correctas, 0 fallidas, 0 omitidas** (incluye consulta por voz con audio de espeak-ng
transcrito por Whisper `small`, y un `.xlsx` valido con hojas Datos/Resumen y cabecera Grupo/Citas/Confirmadas/Canceladas). Ademas `scripts/seed/citas-sinteticas.mjs` sembro 595 citas por la API real.
Para ejecutarlo aqui hubo que remapear el puerto de PostgreSQL (5432 ocupado por otro proyecto): ahora el compose usa `POSTGRES_HOST_PORT` (`POSTGRES_HOST_PORT=5440 POSTGRES_PORT=5440 DB_PORT=5440 scripts/e2e-ms7.sh`).

Errores reales que la verificacion encontro y se corrigieron: (1) el redactor eliminaba la clave `documento` de los fragmentos del RAG y el agente no podia citar la fuente (ahora `fuente_titulo`);
(2) los graficos del dashboard no se pintaban cuando los datos llegaban despues del montaje (visto en el navegador); (3) la silueta de K-means premiaba aislar un valor atipico (73 citas en una semana de una prueba anterior): ahora los
valores extremos (> Q3 + 3*IQR) se excluyen del ajuste y se informan en `atipicos_excluidos`.

**Pendiente / limites**
- **Los LLM reales (Gemini/Claude) siguen sin probarse** (sin API keys): el E2E usa el proveedor simulado.
- **Whisper:** la calidad depende del modelo (`base` confunde palabras con voz sintetica; `small` acierta). Con voz humana, acento y ruido ambiente habra que validarlo; la voz de espeak-ng no es representativa.
  Descarga ~460 MB la primera vez; en CPU una frase corta tarda unos segundos.
- **El remoto Vue se verifico en Firefox headless con un backend simulado** (datos, graficos, respuesta del asistente, tabla y botones). **No se probo el microfono real** (Web Speech ni `MediaRecorder`: no hay audio en el entorno) ni
  la descarga de archivos, ni dentro del shell con Keycloak. Web Speech API solo existe en Chromium/Safari; en Firefox siempre se usa la grabacion + Whisper.
- El paquete de la pantalla pesa ~760 kB (ECharts + Apollo); se podria dividir con `import()` dinamico. No hay pruebas de componentes Vue (solo de la logica en `src/lib`).
- `Web Speech` envia el audio al servicio del navegador (p. ej. Google en Chrome): no es privado. Si la politica de datos lo prohibe, desactivar esa estrategia y usar solo Whisper.
- El dashboard no tiene paginacion ni filtros de fecha configurables (ventana fija: 90 dias atras y 30 adelante).
- K-means con datos de MS3: MS3 solo guarda citas futuras (se siembran de los proximos meses), asi que la "demanda" es la agenda reservada, no demanda historica.
- Las respuestas GraphQL de error no pasan por el gateway con 401 si no hay token: lo rechaza el gateway (HTTP 401 sin cuerpo GraphQL).

## Backend: flujos y endpoints entre servicios (plan por fases)

Objetivo: dejar los servicios listos para conectar los frontends (que hoy usan datos de ejemplo) sin tocar `apps/`. Convenciones y rutas en `docs/api.md`.

- **Fase 0 (hecha):** `@sigec/http-nest` (problem+json, correlacion, paginacion) en MS3/MS5/MS7/MS8; `ProblemaBase` y 401/403 problem+json en MS2/MS4; MS6 en camelCase, dinero como string y paginacion por cursor; gateway con problem+json, `X-Correlation-Id`, CORS ampliado y rutas de catalogo/identidad (con pruebas); contratos OpenAPI versionados y `make openapi-check`; `@sigec/api-types`.
- **Contratos:** los servicios FastAPI (ML, embeddings, Whisper, inferencia) no tienen OpenAPI versionado (importar TensorFlow en un test es pesado; son internos). MS6 se escribe a mano. Los contratos son JSON (no YAML) para no agregar dependencias.
- **Cambios de contrato ya hechos (rompen a quien los use):** MS6 ahora recibe `citaId`/`pacienteId` (antes snake_case), lista `{items, siguiente}` (antes un arreglo), `monto` y `confirmado/provisional` como string, validacion 400 (antes 422). MS7 y los scripts E2E ya se adaptaron.
- **Fase 1 (hecha):** MS2 con busqueda fonetica paginada (`sigec_fonetica`, pg_trgm), `numero_historia`, edicion con `If-Match`/`ETag` y `paciente.actualizado`, contactos de emergencia, solicitudes de actualizacion (aprobar/rechazar) y catalogo de especialidades y medicos con `medico.creado|actualizado`. `paciente.creado` suma `numeroHistoria` (opcional). Pendiente: `make datos-docs` para regenerar el diccionario con las tablas nuevas; el vinculo usuario-medico por claim `medico_id` llega con `ms1-identidad` (hoy se une por `usuarioKeycloak` = `preferred_username`).
- **Fase 2 (hecha):** MS3 con cancelar, reprogramar (atomico), asistencia, historial de la SAGA, agenda del dia y del medico, resumen agregado, filtro por estado, plantilla semanal, generacion de horarios, bloqueos, `BLOQUEADO`, modo `HORARIOS_ESTRICTOS` (apagado por defecto: los E2E y la SAGA reservan fechas sin publicar) y proyecciones por eventos. Eventos `cita.cancelada`, `cita.reprogramada`, `cita.asistencia-registrada`. La semilla (`make seed`) tambien escribe las proyecciones. Pendiente: MS8 aun no reacciona a `cita.cancelada|reprogramada` (Fase 6); MS7 aun pagina todas las citas en vez de usar `/api/citas/resumen` (Fase 7); verificar el E2E completo `scripts/e2e-saga.sh` con la pila levantada (Fase 9).
- **Fase 3 (hecha):** MS6 con pagos (comprobante `CI-000873`, estado `PAGADA`), anulacion con motivo, movimientos y balance diarios por turno, tarifario (nueva tarifa cierra la anterior), n.° de cargo `CG-AAAAMMDD-NNNN`, especialidad y fecha de la cita en la factura, y proyeccion de nombres de paciente (cola `ms6.eventos`, proceso `eventos:consume`; en Docker `ms6-eventos-consumer`, en local `scripts/dev-services.sh`). Eventos `pago.registrado` y `factura.anulada`. **Pendiente:** comprobante en PDF (faltan las extensiones `gd`/`bcmath`; hoy JSON o HTML imprimible); el `numero_cargo` y el `numero_historia` de la semilla los asigna la base; `make datos-docs` para el diccionario; `ingresos` ya cuenta los cargos PAGADA como confirmados.
- **Fase 4 (hecha):** MS4 con API en `/api/historias`: historia por paciente, consultas (borrador -> firmada, ligadas a `citaId`; `If-Match` y 409 `VERSION_CONFLICTO` con `versionVigente`), evoluciones inmutables, receta, antecedentes (baja logica), consentimientos (los otorga y revoca el paciente) y auditoria automatica de cada lectura/escritura (solo el administrador la consulta, paginada y filtrable por accion). Roles: medico lee y escribe; paciente solo lo suyo y lo firmado; recepcion/caja no entran. Consume `ms4.eventos` (antes `ms4.eventos.pacientes`, sin consumidor): `paciente.creado|actualizado` crean/actualizan la historia y `cita.confirmada|cancelada|asistencia-registrada` alimentan `citas_proyeccion`, que decide si una cita permite iniciar la consulta. Publica `consulta.firmada` (solo ids). `scripts/test-outbox.sh` usa ahora su propia cola de prueba. Limites: la lista de estudios de imagen en la historia y el consentimiento `IMAGENES_IA` esperan a la Fase 5 (`imagen.informe-validado`); un paciente con historia solo se crea al llegar `paciente.creado` (los anteriores a esta fase no tienen fila: reemitir el evento o insertarla); la firma no es electronica avanzada (guarda `sub` y fecha).
- **Fase 5 (hecha):** MS5 con `origen` (medico/paciente), `validacion` PENDIENTE/VALIDADO/DESCARTADO, snapshot de nombre y n.° de historia (de MS2), busqueda `q`, listado sin `pacienteId` para el personal, `409 IMAGEN_DUPLICADA` por huella y paciente, `POST /api/imagenes/{id}/validacion` (huella de la firma, evento `imagen.informe-validado` con id estable y republicacion por barrido si RabbitMQ falla) y `GET …/gradcam-url`. El paciente solo ve lo validado. MS4 proyecta el evento (`estudios_proyeccion`) y lo lista en `GET /api/historias/{id}/estudios`. Validador e indices de Mongo actualizados en `scripts/mongo-init/esquema.mjs` (ejecutar `make mongo-init`). **Limites:** la inferencia (Python) todavia **no genera Grad-CAM**: el campo opcional `gradcamKey` del evento `imagenes.analisis.completado` y el endpoint estan listos, el servicio devuelve 404 hasta que se implemente; la verificacion del consentimiento `IMAGENES_IA` antes de que el paciente suba queda como decision pendiente (acoplaria MS5 con MS4); los estudios anteriores a esta fase no traen `origen`/`validacion` (se tratan como MEDICO/PENDIENTE solo si se reescriben).
- **Fase 6 (hecha):** MS8 con historial por paciente (`gsi3`) con filtros y cursor, resumen diario (`gsi4`), marcar leidas (puntero `NOTIF#<id>`), reenviar fallidas, plantillas versionadas y validadas (`If-Match`; variables permitidas, sin contenido clinico), preferencias de tipos de aviso y antelacion del recordatorio, preferencias de alertas del personal, `DELETE /telegram/vinculo` y recordatorio reforzado. Consume `cita.cancelada` (deja de recordar), `cita.reprogramada` (nueva fecha y aviso, uno por fecha), `paciente.actualizado` (contacto) e `imagen.informe-validado` (aviso sin datos clinicos). **Ejecutar `make dynamodb-init`** para crear `gsi3` y `gsi4` en `notificaciones`. **Cambio de contrato:** `GET /api/notificaciones` devuelve `{items, siguiente}` (antes un arreglo); `e2e-saga.sh` y `e2e-notificaciones.sh` ya se adaptaron pero **no se ejecutaron**. Limites: las notificaciones anteriores a esta fase no tienen `gsi3`/`gsi4`/puntero (no salen en el historial, el resumen ni se pueden marcar o reenviar); las preferencias del personal se guardan pero **aun no filtran** a quien llega cada alerta (hoy el webhook `alerta-interna` es unico); el workflow de n8n del recordatorio sigue llamando a `/internal/recordatorios/pendientes?horas=24` (ya respeta la antelacion de cada paciente); `ESTUDIO_VALIDADO` guarda el id del estudio en `citaId`.
- **Fases 7-9 pendientes:** ver el plan (MS7 alertas, `ms1-identidad`, E2E de flujos).

## Diseno visual en los frontends (`design.md` por app)

Origen: diseno "Mapa de pantallas SIGEC" (Claude Design, ~90 artboards). Tokens y estilos en `packages/design-tokens`; cada app tiene su `design.md` con el mapa artboard -> ruta.

- **Hecho:** todas las pantallas del diseno estan trasladadas: shell (acceso, recuperar, inicio por rol, administracion, perfil, estados), Angular clinica (36 rutas), Vue gestion (8 vistas), PWA (9 + acceso) y movil (9). Datos de ejemplo del diseno; no hay conexion a APIs nuevas.
- **Verificado en Chromium (headless, Keycloak real, builds de produccion servidos con `rsbuild preview` / `vite preview` / servidor estatico):** login de recepcion, medico, caja y administrador; carga de ambos remotos dentro del shell con sus estilos;
  navegacion del menu dentro de un mismo remoto; cambio de remoto (desmontaje limpio); 403 para un rol sin permiso; recuperar contrasena sin sesion; estado vacio de pacientes; sin errores en consola.
  Esa verificacion encontro y corrigio dos fallos reales: el router de Angular no navegaba al montarse (falta `initialNavigation`) y el menu del shell no cambiaba de pantalla dentro de un remoto (`popstate`/`hashchange`).
- **Sin verificar:** PWA y app movil en navegador/dispositivo (solo `build` y `tsc`); microfono real y descarga de archivos del asistente; Firefox/Safari; teclado y lector de pantalla; el dashboard Vue con el backend levantado (en la prueba el gateway no estaba, asi que mostro el aviso de error);
  el aviso "sin conexion" del shell (la logica es `navigator.onLine`, no se simulo).
- **Fuentes:** Public Sans e IBM Plex Mono se cargan de Google Fonts (dependencia externa; sin conexion cae a `system-ui`, incluso en la PWA). Alternativa: `@fontsource` en el paquete de tokens.
- **Tokens duplicados a mano:** `packages/design-tokens/{sigec.css,tokens.js}` y `apps/mobile/src/theme.ts` (movil usa npm). Un cambio de color toca los tres.
- **Angular:** se retiro el tema global de Material (pisaba `html`/`body` del shell); Material sigue instalado sin uso. Presupuesto `anyComponentStyle` 16/24 kB; build sin inlining de fuentes (no depende de la red).
- **Rutas por hash** (`/clinica#/...`, `/gestion#/...`): el shell sigue siendo dueno de la URL y el contrato `mount/unmount` no cambia.
- **Menu duplicado en Vue:** el remoto Vue conserva sus pestanas internas (sirven en modo independiente) ademas del menu del shell.
- **Movil:** login es una maqueta (no llama a Keycloak); navegacion por pila propia sin React Navigation; iconos de la barra son glifos de texto.
- **Todo con datos de ejemplo:** las pantallas no llaman a las APIs de MS2/MS3/MS4/MS5/MS6/MS8 (salvo el dashboard y el asistente de MS7 que ya las usaban). Conectarlas es el siguiente paso.

## Datos (auditoria y modelo de datos, `docs/datos/`)

Hecho: migraciones ms2 V3, ms4 V3, ms6 (`2026_11_06_000001`), ms7 `0002`; `GET /api/citas/disponibilidad` (Query); TTL en `citas`; `scripts/mongo-init`; `make seed`/`seed-reset`;
`make datos-docs`, `datos-explain`, `db-purge`, `db-backup`. Verificado: Spring `EsquemaDatosIntegrationTest` en ms2 (4) y ms4 (4) + suites completas de ambos; MS6 66 pruebas (incl. tarifas, ledger, purga) y camino
`migrate -> rollback -> migrate` con datos; ms3 54 y ms5 36 (con el validador de Mongo activo); ms7 87 + migracion 0002 aplicada por la app sobre una base con datos del RAG;
`make e2e-saga` 66/66; EXPLAIN de 5 consultas con el indice previsto (`docs/datos/explain.md`).

**Lo que NO se verifico / limites**
- No se ejecutaron `e2e-ms7.sh`, `e2e-notificaciones.sh` ni `e2e-imagenes.sh` (los dos primeros necesitan servicios Python/n8n; el tercero ya estaba pendiente). Los cambios de MS7 (auditoria en PostgreSQL) y MS6 (tarifa desde tabla) solo tienen pruebas unitarias/de integracion.
- La entrega de `edad/beca/seguro/asistencia` a MS7 esta **diseñada, no implementada**: los datos existen (MS2 `pacientes`, MS3 `asistencia`) pero MS7 sigue usando valores neutros. No hay endpoint para registrar la asistencia (solo la semilla la escribe).
- MS4: las tablas de antecedentes, evoluciones, consentimientos y auditoria ya tienen API (Fase 4).
- `facturas.created_at/updated_at` siguen siendo `timestamp without time zone` (Laravel); `pagos` no existe (la SAGA no cobra definitivo).
- Diseñados, no implementados: `paciente.actualizado`, paginacion de `GET /api/pacientes`, particion mensual de `gsi4`, particionado del outbox, cifrado a nivel de campo, TTL de `outbox`/notificaciones.
- La semilla escribe directo en las bases (sin eventos) y las imagenes sembradas no tienen objeto en S3. `paciente-demo.sh` queda redundante.
- Encargo vs. realidad: el `Scan` de `GET /api/citas` ya se habia reemplazado en el bloque 0; no habia nada que migrar en el codigo de acceso.
- Incidente: un primer `make mongo-init` leyo `.env` y creo la coleccion `imagenes` vacia en el MongoDB del puerto 27017, que es de **otro proyecto**; se elimino esa coleccion vacia y se corrigio el script (ya no pisa variables). Nada mas se toco alli.
- Entorno: 5432, 27017 y 8000 estan ocupados por otros proyectos; se verifico con `POSTGRES_HOST_PORT=5440 MONGO_HOST_PORT=27040 DYNAMODB_HOST_PORT=8040`.

## Pila en Docker (`docker-compose.full.yml`)

Hecho: imágenes de todos los servicios y frontends, tarea `init`, `outbox-poller`, procesos de fondo de MS6, `make up-core` / `up-all`. Verificado con `make up-core`: 22 contenedores arriba, healthchecks en verde,
login por Keycloak y llamadas por el gateway (200 con token, 401 sin él), cola `ms6.saga.comandos` drenada (614 → 0) sin mensajes en DLQ. Guía: `docs/docker.md`.

- **No verificado:** `make up-all` (ML: `ms7-ml`, `ms7-embeddings`, `ms7-whisper`, `ms5-inference`: imágenes sin construir ni arrancar aquí), el flujo en el navegador (login del shell y remotos Vue/Angular), `make n8n-import` dentro de la pila,
  y los comandos `kcadm` de la guía.
- Los E2E (`make e2e-saga`, `scripts/e2e-*.sh`) siguen pensados para servicios en el host; no se adaptaron a la pila en contenedores.
- Las imágenes Nest conservan dependencias de desarrollo y el repo completo (simple, pesada: `ms7-api` ~1,5 GB). Una imagen de producción mínima (`pnpm deploy`) queda pendiente.
- Keycloak sigue en `start-dev`, sin TLS, con usuarios y contraseñas de ejemplo: solo desarrollo.
- MS6 monta `contracts/events/topology.json` como volumen (su imagen no contiene el monorepo); cualquier otro archivo de `contracts/` que MS6 llegue a leer en tiempo de ejecución necesitará lo mismo.
