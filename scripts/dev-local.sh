#!/usr/bin/env bash
# Desarrollo local SIN construir imagenes: Docker solo para la infraestructura y todo lo demas en el host con recarga al guardar.
#   scripts/dev-local.sh up [--ml] [--sin-frontends] [--sin-backend]   levanta todo (idempotente: lo que ya corre no se toca)
#   scripts/dev-local.sh down [--infra]                                 para servicios y frontends (con --infra tambien Docker)
#   scripts/dev-local.sh status                                         estado de cada servicio y frontend
#   scripts/dev-local.sh logs <nombre>                                  sigue el log (ms3, shell, remote-vue...)
# Recarga: Nest `nest start --watch`, Spring `spring-boot:run` (recompila con `./mvnw compile` o desde el IDE), Laravel sirve el codigo
# tal cual, frontends con Vite/Rsbuild (HMR). No mezclar con `make up-core`/`up-all`: usan los mismos puertos.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="${SIGEC_LOGS:-/tmp/sigec-logs}"
mkdir -p "$LOGS"
cd "$ROOT"

[ -f .env ] || { echo "falta .env: cp .env.example .env y cambia las contrasenas"; exit 1; }

# Variables del .env para todo lo que se lanza desde aqui (make dynamodb-init, etc.); las ya exportadas en el entorno no se pisan.
while IFS='=' read -r k v; do
  [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  [ -z "${!k+x}" ] && export "$k=$v"
done <.env

# nombre|puerto|directorio|comando  (los remotos y la PWA van con su servidor de desarrollo, no con build + preview)
FRONTENDS=(
  "shell|5173|apps/shell|pnpm dev"
  "remote-vue|5175|apps/remote-vue|pnpm dev"
  "remote-angular|4201|apps/remote-angular|pnpm start"
  "pwa-paciente|5174|apps/pwa-paciente|pnpm dev"
)
BACKEND=(gateway ms1 ms2 ms3 ms4 ms5 ms6 ms7 ms8)
BACKEND_ML=(ms5-inference ms7-ml ms7-embeddings)

pid_on_port() { ss -ltnp "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1; }
env_val() { if [ -n "${!1:-}" ]; then echo "${!1}"; else grep -E "^$1=" .env | tail -1 | cut -d= -f2-; fi; }

hay_pnpm() { command -v pnpm >/dev/null || { echo "falta pnpm"; exit 1; }; }

esperar_http() { # url intentos
  for _ in $(seq 1 "${2:-60}"); do curl -s -o /dev/null "$1" && return 0; sleep 2; done
  return 1
}

cmd_infra() {
  echo "== Infraestructura (Docker, sin build: solo imagenes publicas) =="
  # Un puerto ocupado por OTRO proyecto es lo que mas falla: se corta aqui, con la solucion, en vez de seguir con la infraestructura a medias.
  local pg mongo dyn ocupados=0
  pg="$(env_val POSTGRES_HOST_PORT)"; mongo="$(env_val MONGO_HOST_PORT)"; dyn="$(env_val DYNAMODB_HOST_PORT)"
  for p in "${pg:-5432}:postgres:POSTGRES_HOST_PORT" "${mongo:-27017}:mongo:MONGO_HOST_PORT" "${dyn:-8000}:dynamodb:DYNAMODB_HOST_PORT" 8080:keycloak: 5672:rabbitmq: 5678:n8n:; do
    IFS=: read -r port name var <<<"$p"
    # Si el contenedor de SIGEC ya esta levantado en ese puerto no es un conflicto.
    docker compose ps --status running --format '{{.Name}}' 2>/dev/null | grep -q "sigec-$name" && continue
    pid="$(pid_on_port "$port")"
    [ -z "$pid" ] && continue
    ocupados=1
    echo "ERROR: el puerto $port (necesario para $name) lo usa otro proceso: $(ps -o cmd= -p "$pid" | cut -c1-90)"
    [ -n "$var" ] && echo "       cambia $var en .env (y, si aplica, POSTGRES_PORT/DB_PORT/DB_URL o DYNAMODB_ENDPOINT); ver docs/desarrollo-local.md"
  done
  [ "$ocupados" = 1 ] && exit 1
  docker compose up -d --wait --wait-timeout 240 || { echo "ERROR: la infraestructura no levanto; revisa 'docker compose ps' y 'docker compose logs'"; exit 1; }
  echo "== Tablas, colas y buckets (repetibles) =="
  esperar_http "http://localhost:15672" 30 || true
  make -s dynamodb-init rabbitmq-declare mongo-init s3-init 2>&1 | tail -n 8 || true
  esperar_http "http://localhost:8080/realms/sigec" 60 || echo "AVISO: Keycloak aun no responde en :8080"
}

cmd_dependencias() {
  hay_pnpm
  if [ ! -d node_modules/.pnpm ] && [ ! -d apps/shell/node_modules ]; then
    echo "== pnpm install (primera vez) =="
    pnpm install || exit 1
  fi
  # Las dependencias de PHP las pide el servicio MS6.
  if [ ! -d services/ms6-facturacion/vendor ] && command -v composer >/dev/null; then
    (cd services/ms6-facturacion && composer install --no-interaction)
  fi
}

cmd_backend() {
  echo "== Servicios (${BACKEND[*]}$([ "${ML:-0}" = 1 ] && echo " ${BACKEND_ML[*]}")) =="
  local lista=("${BACKEND[@]}")
  [ "${ML:-0}" = 1 ] && lista+=("${BACKEND_ML[@]}")
  scripts/dev-services.sh start "${lista[@]}"
  scripts/dev-services.sh poller-start
  scripts/dev-services.sh workers-start
}

cmd_frontends() {
  echo "== Frontends (servidores de desarrollo con recarga) =="
  for entry in "${FRONTENDS[@]}"; do
    IFS='|' read -r name port dir command <<<"$entry"
    if [ -n "$(pid_on_port "$port")" ]; then echo "$name ya esta en el puerto $port"; continue; fi
    (cd "$ROOT/$dir"; nohup bash -c "$command" >"$LOGS/$name.log" 2>&1 </dev/null &)
  done
  for entry in "${FRONTENDS[@]}"; do
    IFS='|' read -r name port dir command <<<"$entry"
    esperar_http "http://localhost:$port" 90 || true
    printf '%-15s %-5s %s\n' "$name" "$port" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port")"
  done
}

cmd_up() {
  local backend=1 frontends=1
  ML=0
  for a in "$@"; do
    case "$a" in
      --ml) ML=1 ;;
      --sin-frontends) frontends=0 ;;
      --sin-backend) backend=0 ;;
      *) echo "opcion desconocida: $a"; exit 1 ;;
    esac
  done
  export ML
  cmd_infra
  cmd_dependencias
  [ "$backend" = 1 ] && cmd_backend
  [ "$frontends" = 1 ] && cmd_frontends
  echo
  echo "Listo. Shell: http://localhost:5173 | Keycloak: http://localhost:8080 | Gateway: http://localhost:8090"
  echo "Usuarios (Sigec123!): administrador, recepcion, medico, caja, paciente. Logs en $LOGS (scripts/dev-local.sh logs <nombre>)."
  echo "Primera vez con base vacia: make keycloak-aplicar seed"
}

cmd_down() {
  for entry in "${FRONTENDS[@]}"; do
    IFS='|' read -r name port dir command <<<"$entry"
    pid="$(pid_on_port "$port")"
    [ -n "$pid" ] && pkill -P "$pid" 2>/dev/null; [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "parado $name ($port)"
  done
  scripts/dev-services.sh workers-stop
  scripts/dev-services.sh poller-stop
  scripts/dev-services.sh stop
  # Los vigilantes de Nest (`nest start --watch`) siguen vivos aunque se pare su hijo en el puerto: se paran por la ruta del repo.
  pkill -f "$ROOT/.*@nestjs/cli/bin/nest.js start --watch" 2>/dev/null
  if [ "${1:-}" = "--infra" ]; then docker compose down; fi
}

cmd_status() {
  echo "== Docker =="; docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null
  echo "== Servicios =="; scripts/dev-services.sh status
  echo "== Frontends =="
  for entry in "${FRONTENDS[@]}"; do
    IFS='|' read -r name port dir command <<<"$entry"
    printf '%-15s %-5s %s\n' "$name" "$port" "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://localhost:$port")"
  done
}

cmd_logs() {
  [ -n "${1:-}" ] || { echo "uso: $0 logs <nombre>   (ls $LOGS)"; exit 1; }
  tail -n 100 -f "$LOGS/$1.log"
}

accion="${1:-}"; shift || true
case "$accion" in
  up) cmd_up "$@" ;;
  down) cmd_down "$@" ;;
  status) cmd_status ;;
  logs) cmd_logs "$@" ;;
  *) sed -n 2,8p "$0"; exit 1 ;;
esac
