#!/usr/bin/env bash
# Prueba de extremo a extremo del relay del outbox (MS2 -> paciente.creado, MS6 -> factura.creada):
#   1. crear por la API (token real + Idempotency-Key) y verificar que el mensaje llega a la cola;
#   2. apagar RabbitMQ, crear otro, volver a encenderlo y verificar que se publica DESPUES sin perder el evento
#      y sin duplicados (cada id aparece una sola vez).
# Requiere docker compose up -d, make rabbitmq-declare y gateway + ms2 + ms6 en marcha
# (scripts/dev-services.sh start gateway ms2 ms6). Detiene y vuelve a arrancar el contenedor de RabbitMQ.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
GW="${GATEWAY_URL:-http://localhost:8090}"
KC="http://localhost:8080/realms/sigec/protocol/openid-connect/token"
MGMT="http://localhost:15672/api"
AUTH="$RABBITMQ_USER:$RABBITMQ_PASSWORD"
Q_PAC="ms4.eventos.pacientes"
Q_FAC="test.outbox.facturas"
fail=0

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; else printf '  FALLO %s (esperado %s, obtenido %s)\n' "$1" "$2" "$3"; fail=1; fi; }
# Lee la cola SIN consumirla (ack_requeue_true) y devuelve los ids de los sobres, uno por linea.
queue_ids() {
  curl -s -u "$AUTH" -X POST "$MGMT/queues/%2F/$1/get" -H 'content-type: application/json' \
    -d '{"count":50,"ackmode":"ack_requeue_true","encoding":"auto"}' |
    python3 -c 'import sys,json
for m in json.load(sys.stdin): print(json.loads(m["payload"])["id"])'
}
queue_types() {
  curl -s -u "$AUTH" -X POST "$MGMT/queues/%2F/$1/get" -H 'content-type: application/json' \
    -d '{"count":50,"ackmode":"ack_requeue_true","encoding":"auto"}' |
    python3 -c 'import sys,json
for m in json.load(sys.stdin): print(json.loads(m["payload"])["type"])'
}
pending_pac() { docker compose exec -T postgres psql -U sigec -d ms2_pacientes -tAc "select count(*) from outbox where published_at is null"; }
pending_fac() { docker compose exec -T postgres psql -U sigec -d ms6_facturacion -tAc "select count(*) from outbox where published_at is null"; }
purge() { curl -s -u "$AUTH" -X DELETE "$MGMT/queues/%2F/$1/contents" -o /dev/null; }
wait_for() { # descripcion comando-que-imprime-numero esperado timeout-s
  local t=0; while [ "$t" -lt "$4" ]; do [ "$(eval "$2")" = "$3" ] && return 0; sleep 1; t=$((t + 1)); done; return 1
}
count_unique() { sort -u | grep -c . ; }

echo "== Preparacion"
# Cola de verificacion para facturas y purga de las colas
curl -s -u "$AUTH" -X PUT "$MGMT/queues/%2F/$Q_FAC" -H 'content-type: application/json' -d '{"durable":true}' -o /dev/null
curl -s -u "$AUTH" -X POST "$MGMT/bindings/%2F/e/sigec.eventos/q/$Q_FAC" -H 'content-type: application/json' -d '{"routing_key":"factura.#"}' -o /dev/null
# Relay de MS6 (proceso aparte; el de MS2 va dentro del servicio)
mkdir -p /tmp/sigec-logs
(cd services/ms6-facturacion; nohup php artisan outbox:relay --interval=1 >/tmp/sigec-logs/ms6-relay.log 2>&1 </dev/null & echo $! >/tmp/sigec-ms6-relay.pid)
# Se vacia cualquier pendiente anterior (de otras pruebas) y SOLO ENTONCES se purgan las colas, para medir desde cero.
wait_for "backlog MS2" pending_pac 0 60; wait_for "backlog MS6" pending_fac 0 60
sleep 1; purge "$Q_PAC"; purge "$Q_FAC"
TR=$(token recepcion); TC=$(token caja)

crear_paciente() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/pacientes" -H "Authorization: Bearer $TR" -H "Idempotency-Key: $(uuid)" \
    -H 'Content-Type: application/json' -d "{\"nombre\":\"Out\",\"documento\":\"O-$RANDOM$RANDOM\",\"fechaNacimiento\":\"1990-05-01\"}"
}
crear_factura() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/facturacion/facturas" -H "Authorization: Bearer $TC" -H "Idempotency-Key: $(uuid)" \
    -H 'Content-Type: application/json' -d "{\"citaId\":\"$(uuid)\",\"pacienteId\":\"$(uuid)\",\"monto\":99}"
}

echo "== 1) Con RabbitMQ encendido: la API crea y el relay publica"
check "MS2 POST /api/pacientes -> 201" 201 "$(crear_paciente)"
check "MS6 POST /api/facturacion/facturas -> 201" 201 "$(crear_factura)"
wait_for "paciente.creado en cola" "queue_ids $Q_PAC | grep -c ." 1 20; check "paciente.creado llego a $Q_PAC" 1 "$(queue_ids $Q_PAC | grep -c .)"
wait_for "factura.creada en cola" "queue_ids $Q_FAC | grep -c ." 1 20; check "factura.creada llego a $Q_FAC" 1 "$(queue_ids $Q_FAC | grep -c .)"
check "tipo del mensaje de MS2" "paciente.creado" "$(queue_types $Q_PAC | head -1)"
check "tipo del mensaje de MS6" "factura.creada" "$(queue_types $Q_FAC | head -1)"
check "outbox de MS2 sin pendientes" 0 "$(pending_pac)"
check "outbox de MS6 sin pendientes" 0 "$(pending_fac)"

echo "== 2) Se apaga RabbitMQ y se crean mas eventos"
docker compose stop rabbitmq >/dev/null 2>&1
sleep 2
check "MS2 sigue creando (201) con RabbitMQ apagado" 201 "$(crear_paciente)"
check "MS6 sigue creando (201) con RabbitMQ apagado" 201 "$(crear_factura)"
sleep 3
check "el evento de MS2 queda pendiente en el outbox" 1 "$(pending_pac)"
check "el evento de MS6 queda pendiente en el outbox" 1 "$(pending_fac)"

echo "== 3) Se enciende RabbitMQ: los pendientes se publican despues"
docker compose start rabbitmq >/dev/null 2>&1
for _ in $(seq 1 60); do curl -s -u "$AUTH" "$MGMT/overview" -o /dev/null && break; sleep 1; done
wait_for "outbox MS2 vacio" pending_pac 0 90; check "MS2 publico el pendiente (outbox vacio)" 0 "$(pending_pac)"
wait_for "outbox MS6 vacio" pending_fac 0 90; check "MS6 publico el pendiente (outbox vacio)" 0 "$(pending_fac)"
sleep 2
check "la cola de pacientes tiene 2 mensajes" 2 "$(queue_ids $Q_PAC | grep -c .)"
check "...y ningun id repetido" 2 "$(queue_ids $Q_PAC | count_unique)"
check "la cola de facturas tiene 2 mensajes" 2 "$(queue_ids $Q_FAC | grep -c .)"
check "...y ningun id repetido" 2 "$(queue_ids $Q_FAC | count_unique)"

echo "== Limpieza"
kill "$(cat /tmp/sigec-ms6-relay.pid 2>/dev/null)" 2>/dev/null
curl -s -u "$AUTH" -X DELETE "$MGMT/queues/%2F/$Q_FAC" -o /dev/null
purge "$Q_PAC"

[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
