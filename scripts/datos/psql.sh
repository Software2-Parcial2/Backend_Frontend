#!/usr/bin/env bash
# psql dentro del contenedor de PostgreSQL de SIGEC (no hace falta psql en el host).
#   scripts/datos/psql.sh <base> [argumentos de psql]   (SQL por stdin con -f - o redireccion)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; [ -f .env ] && source .env; set +a
base="${1:?uso: psql.sh <base> [args...]}"; shift
exec docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-sigec}" -d "$base" "$@"
