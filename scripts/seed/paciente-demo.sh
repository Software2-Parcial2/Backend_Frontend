#!/usr/bin/env bash
# Crea (repetible) en MS2 el paciente ligado al usuario `paciente` de Keycloak (claim paciente_id).
# Inserta directo en la BD porque la API genera ids aleatorios. Solo desarrollo.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
set -a; source .env; set +a
docker compose exec -T postgres psql -q -U "$POSTGRES_USER" -d ms2_pacientes -c \
  "INSERT INTO pacientes (id, nombre, documento, fecha_nacimiento, email)
   VALUES ('a0000000-0000-4000-8000-000000000001', 'Paciente Prueba', 'DEMO-0001', '1990-01-01', 'paciente@sigec.test')
   ON CONFLICT (id) DO NOTHING;"
echo "Paciente demo a0000000-0000-4000-8000-000000000001 listo."
