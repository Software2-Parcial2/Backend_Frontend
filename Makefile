# Atajos de desarrollo de SIGEC. Requiere `docker compose up -d` y `pnpm install`.
SHELL := /bin/bash
ENV_FILE := .env

.PHONY: infra-up dynamodb-init rabbitmq-declare e2e-saga dlq-replay n8n-import n8n-export s3-init

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
