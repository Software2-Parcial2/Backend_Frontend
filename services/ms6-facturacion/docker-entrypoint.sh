#!/bin/sh
# Entrada del contenedor de MS6. Modos: serve (API + migraciones), relay (outbox -> RabbitMQ), consume (comandos de la SAGA).
set -e
cd /app

# Sin APP_KEY se genera una efimera: MS6 no cifra datos persistentes (sesion y cache en "array"/archivo), vale para desarrollo.
if [ -z "${APP_KEY:-}" ]; then
  APP_KEY="base64:$(head -c 32 /dev/urandom | base64)"
  export APP_KEY
fi

esperar_bd() {
  # Solo PDO: la imagen trae pdo_pgsql, no la extension pgsql (pg_connect).
  until php -r 'try{new PDO("pgsql:host=".getenv("DB_HOST").";port=".getenv("DB_PORT").";dbname=".getenv("DB_DATABASE"),getenv("DB_USERNAME"),getenv("DB_PASSWORD"));exit(0);}catch(Throwable $e){exit(1);}' 2>/dev/null; do
    echo "esperando a PostgreSQL..."; sleep 2
  done
}

case "${1:-serve}" in
  serve)
    esperar_bd
    php artisan migrate --force
    exec php artisan serve --no-reload --host=0.0.0.0 --port="${PORT:-8006}" ;;
  relay)
    esperar_bd
    exec php artisan outbox:relay --interval=1 ;;
  consume-eventos)
    esperar_bd
    exec php artisan eventos:consume ;;
  consume)
    esperar_bd
    exec php artisan saga:consume ;;
  *) exec "$@" ;;
esac
