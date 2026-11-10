# Atajos de desarrollo de SIGEC. Requiere `docker compose up -d` y `pnpm install`.
SHELL := /bin/bash
ENV_FILE := .env

.PHONY: dev up-all up-core up-all-rapido up-core-rapido down-all ps-all infra-up dynamodb-init rabbitmq-declare e2e-saga dlq-replay n8n-import n8n-export s3-init mongo-init seed seed-reset datos-docs datos-explain db-purge db-backup openapi-check openapi-update keycloak-aplicar

infra-up:
	docker compose up -d

# Crea (de forma repetible) las tablas de DynamoDB Local de MS3 y MS8.
dynamodb-init:
	pnpm --filter @sigec/scripts run dynamodb:init

# Declara exchanges, colas, DLQ y colas de espera segun contracts/events/topology.json.
rabbitmq-declare:
	set -a; source $(ENV_FILE); set +a; pnpm --filter @sigec/scripts run rabbitmq:declare

# Prueba de extremo a extremo de la SAGA de citas (Bloque I).
e2e-saga:
	bash scripts/e2e-saga.sh

# Mueve mensajes de una DLQ a su cola original conservando el id del sobre (la deduplicacion sigue funcionando).
#   make dlq-replay QUEUE=ms6.saga.comandos [LIMIT=10]
dlq-replay:
	@test -n "$(QUEUE)" || (echo "uso: make dlq-replay QUEUE=<cola> [LIMIT=<n>]"; exit 1)
	set -a; source $(ENV_FILE); set +a; node scripts/dlq-replay.mjs $(QUEUE) $(LIMIT)

# Importa (o actualiza) los workflows de n8n versionados en infra/n8n/workflows/ y los deja activos.
# Los secretos NO estan en los workflows: n8n los lee de variables de entorno ($env.X, ver docker-compose.yml y .env).
n8n-import:
	docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
	for id in sigecEnviarNotif sigecAlertaInter sigecRecordatori sigecTelegramVin; do docker compose exec -T n8n n8n publish:workflow --id=$$id || exit 1; done
	docker compose restart n8n
	@echo "esperando a n8n..."; for i in $$(seq 1 60); do curl -sf http://localhost:5678/healthz >/dev/null && break; sleep 2; done; echo "n8n listo"

# Exporta los workflows actuales de n8n de vuelta a infra/n8n/workflows/ (tras editarlos en la interfaz).
n8n-export:
	docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/wf-export
	@mkdir -p infra/n8n/workflows; for f in sigecEnviarNotif:enviar-notificacion sigecAlertaInter:alerta-interna sigecRecordatori:recordatorio-cita sigecTelegramVin:telegram-vinculacion; do id=$${f%%:*}; name=$${f##*:}; docker compose cp n8n:/tmp/wf-export/$$id.json infra/n8n/workflows/$$name.json; done

# Crea (repetible) el bucket privado de radiografias en SeaweedFS.
s3-init:
	set -a; source $(ENV_FILE); set +a; node scripts/s3-init.mjs

# Crea (repetible) la coleccion de MongoDB de MS5 con su validador $jsonSchema e indices (scripts/mongo-init).
# Lee .env sin pisar variables ya definidas: MONGO_URL=mongodb://localhost:27040/sigec_imagenes make mongo-init
mongo-init:
	pnpm --filter @sigec/scripts run mongo:init

# Datos semilla ficticios y coherentes entre servicios (solo desarrollo). Ver scripts/seed/README.md.
seed:
	pnpm --filter @sigec/scripts run seed

# Borra SOLO lo sembrado (ids fijos). Se niega a correr con SIGEC_ENV=prod o hosts que no sean locales.
seed-reset:
	pnpm --filter @sigec/scripts run seed:reset

# Regenera docs/datos/diccionario-generado.md y erd-generado.md desde las bases reales (PostgreSQL, DynamoDB, MongoDB).
datos-docs:
	pnpm --filter @sigec/scripts run datos:docs

# EXPLAIN de las 5 consultas principales de PostgreSQL -> docs/datos/explain.md.
datos-explain:
	pnpm --filter @sigec/scripts run datos:explain

# Retencion: ejecuta purgar_tecnico() en ms2, ms4 y ms6 (outbox publicado > 7 dias, idempotencia y mensajes procesados vencidos).
db-purge:
	@for db in ms2_pacientes ms4_historias ms6_facturacion; do echo "== $$db"; scripts/datos/psql.sh $$db -c "SELECT * FROM purgar_tecnico()"; done

# Copia de seguridad (pg_dump -Fc) de las bases de SIGEC en backups/ (fuera de Git). Restaurar: pg_restore -d <base> backups/<archivo>.
db-backup:
	@mkdir -p backups; set -a; source $(ENV_FILE); set +a; for db in ms2_pacientes ms4_historias ms6_facturacion ms7_inteligencia; do \
	  docker compose exec -T postgres pg_dump -U $$POSTGRES_USER -Fc $$db > backups/$$db-$$(date +%Y%m%d-%H%M%S).dump && echo "backups: $$db"; done

# --- Pila completa en contenedores (docker-compose.full.yml) ---
COMPOSE_FULL := docker compose -f docker-compose.yml -f docker-compose.full.yml

# Todo: infraestructura + microservicios + frontends + ML (imagenes grandes: TensorFlow, Whisper, embeddings).
up-all:
	$(COMPOSE_FULL) --profile ml --profile inferencia up -d --build

# Sin los servicios de ML pesados (el agente de MS7 y la inferencia de radiografias quedan degradados).
up-core:
	$(COMPOSE_FULL) up -d --build

# RAPIDO (sin --build): usa las imagenes que ya existen y no reconstruye nada. Si falta alguna imagen, compose la construye solo esa vez.
# Usalo en el dia a dia; usa up-core/up-all cuando cambie el codigo o un Dockerfile (los contenedores seguiran con el codigo viejo).
up-core-rapido:
	$(COMPOSE_FULL) up -d

up-all-rapido:
	$(COMPOSE_FULL) --profile ml --profile inferencia up -d

# DESARROLLO: levanta con las imagenes existentes y vigila el codigo; al guardar un archivo reconstruye solo ese servicio.
# Dejar corriendo en una terminal (Ctrl+C detiene la vigilancia, los contenedores siguen arriba).
dev:
	$(COMPOSE_FULL) up -d
	$(COMPOSE_FULL) -f docker-compose.dev.yml watch

down-all:
	$(COMPOSE_FULL) --profile ml --profile inferencia down

ps-all:
	$(COMPOSE_FULL) --profile ml --profile inferencia ps

# --- Contratos REST (contracts/openapi/*.json + packages/api-types) ---
# Los tests de cada servicio comparan el contrato versionado con el que genera su codigo (MS6: rutas contra un archivo escrito a mano).
OPENAPI_NEST := ms1-identidad ms3-citas ms5-api ms7-api ms8-notificaciones
OPENAPI_SPRING := ms2-pacientes ms4-historias

# Falla si algun servicio se desvio de su contrato o si api-types esta desactualizado.
openapi-check:
	@set -e; for s in $(OPENAPI_NEST); do pnpm --filter $$s test:e2e; done
	@set -e; for s in $(OPENAPI_SPRING); do (cd services/$$s && ./mvnw -q test -Dtest=OpenApiContratoTest); done
	@cd services/ms6-facturacion && php artisan test --filter=OpenApiContrato
	@pnpm --filter @sigec/api-types check

# Regenera los contratos desde el codigo y los tipos. Revisa el diff antes de commitear (un cambio de contrato es un cambio de API).
openapi-update:
	@set -e; for s in $(OPENAPI_NEST); do OPENAPI_UPDATE=1 pnpm --filter $$s test:e2e; done
	@set -e; for s in $(OPENAPI_SPRING); do (cd services/$$s && OPENAPI_UPDATE=1 ./mvnw -q test -Dtest=OpenApiContratoTest); done
	@pnpm --filter @sigec/api-types generate

# --- Keycloak: atributos medico_id/especialidad/matricula, eventos y cuentas de servicio (ms1-identidad y agentes de MS7) ---
# Idempotente. Necesita Keycloak en marcha y MS1_CLIENT_SECRET / MS7_CLIENT_SECRET en .env (sin ellos omite las cuentas de servicio).
keycloak-aplicar:
	@node scripts/keycloak-aplicar.mjs
