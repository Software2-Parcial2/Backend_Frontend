# Atajos de desarrollo de SIGEC. Requiere `docker compose up -d` y `pnpm install`.
SHELL := /bin/bash
ENV_FILE := .env

.PHONY: infra-up dynamodb-init rabbitmq-declare e2e-saga dlq-replay

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
