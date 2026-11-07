#!/bin/sh
# Cada paso es repetible (idempotente) y se reintenta mientras la infraestructura arranca.
set -e
paso() {
  nombre="$1"; shift
  n=0
  until "$@"; do
    n=$((n + 1)); [ "$n" -ge 40 ] && { echo "FALLO: $nombre"; exit 1; }
    echo "esperando para $nombre (intento $n)..."; sleep 3
  done
  echo "OK: $nombre"
}
paso "tablas DynamoDB" node dynamodb-init.mjs
paso "topologia RabbitMQ" node rabbitmq-declare.mjs
paso "bucket S3" node s3-init.mjs
paso "coleccion MongoDB" node mongo-init/index.mjs
