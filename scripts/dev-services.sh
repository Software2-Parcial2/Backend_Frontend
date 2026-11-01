#!/usr/bin/env bash
# Levanta/para los servicios de SIGEC en segundo plano para pruebas locales.
#   scripts/dev-services.sh start [gateway ms2 ms3 ms6 ms8 ...]   (sin argumentos: todos los que existen)
#   scripts/dev-services.sh stop  [servicios...]
#   scripts/dev-services.sh status
# Los logs quedan en $SIGEC_LOGS (por defecto /tmp/sigec-logs). Requiere `docker compose up -d` y el .env de la raiz.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="${SIGEC_LOGS:-/tmp/sigec-logs}"
mkdir -p "$LOGS"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

# servicio|puerto|directorio|comando|ruta-de-salud
SERVICES=(
  "gateway|8090|services/gateway|./mvnw -q spring-boot:run|/actuator/health"
  "ms2|8082|services/ms2-pacientes|./mvnw -q spring-boot:run|/actuator/health"
  "ms4|8084|services/ms4-historias|./mvnw -q spring-boot:run|/actuator/health"
  "ms3|3003|services/ms3-citas|pnpm start:dev|/health"
  "ms5|3005|services/ms5-imagenes/api|pnpm start:dev|/health"
  "ms7|3007|services/ms7-inteligencia/api|pnpm start:dev|/health"
  "ms8|3008|services/ms8-notificaciones|pnpm start:dev|/health"
  "ms6|8006|services/ms6-facturacion|php artisan serve --port=8006|/api/facturacion/health"
)

pid_on_port() { ss -ltnp "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1; }

wanted() {
  local name="$1"; shift
  [ "$#" -eq 0 ] && return 0
  for w in "$@"; do [ "$w" = "$name" ] && return 0; done
  return 1
}

cmd_start() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port dir command health <<<"$entry"
    wanted "$name" "$@" || continue
    if [ -n "$(pid_on_port "$port")" ]; then echo "$name ya esta en el puerto $port"; continue; fi
    (cd "$ROOT/$dir" && nohup bash -c "$command" >"$LOGS/$name.log" 2>&1 &)
  done
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port dir command health <<<"$entry"
    wanted "$name" "$@" || continue
    for _ in $(seq 1 90); do
      curl -s -o /dev/null "http://localhost:$port$health" && break
      sleep 2
    done
    printf '%-8s %-5s %s\n' "$name" "$port" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port$health")"
  done
}

cmd_stop() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port dir command health <<<"$entry"
    wanted "$name" "$@" || continue
    pid="$(pid_on_port "$port")"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "parado $name ($port)"
  done
}

cmd_status() {
  for entry in "${SERVICES[@]}"; do
    IFS='|' read -r name port dir command health <<<"$entry"
    printf '%-8s %-5s %s\n' "$name" "$port" "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://localhost:$port$health")"
  done
}

# Poller local del outbox de DynamoDB (MS3/MS8). En AWS lo reemplaza la Lambda; ver docs/outbox.md.
POLLER_JS="$ROOT/services/ms3-citas/lambda-outbox/dist/poller.cjs"
POLLER_PID="/tmp/sigec-outbox-poller.pid"
cmd_poller_start() {
  [ -f "$POLLER_JS" ] || (cd "$ROOT/services/ms3-citas/lambda-outbox" && npm run build >/dev/null 2>&1)
  if [ -f "$POLLER_PID" ] && kill -0 "$(cat "$POLLER_PID")" 2>/dev/null; then echo "poller ya en marcha"; return; fi
  nohup node "$POLLER_JS" >"$LOGS/outbox-poller.log" 2>&1 &
  echo $! >"$POLLER_PID"; echo "outbox-poller iniciado (pid $(cat "$POLLER_PID")), log $LOGS/outbox-poller.log"
}
cmd_poller_stop() { [ -f "$POLLER_PID" ] && kill "$(cat "$POLLER_PID")" 2>/dev/null && echo "outbox-poller parado"; rm -f "$POLLER_PID"; }

action="${1:-status}"; shift || true
case "$action" in
  start) cmd_start "$@" ;;
  stop) cmd_stop "$@" ;;
  status) cmd_status ;;
  poller-start) cmd_poller_start ;;
  poller-stop) cmd_poller_stop ;;
  *) echo "uso: $0 start|stop|status|poller-start|poller-stop [servicios...]"; exit 1 ;;
esac
