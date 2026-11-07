#!/usr/bin/env bash
# Prueba con curl de Idempotency-Key por el gateway (MS2 pacientes, MS6 facturas, MS3 citas).
# Requiere: docker compose up -d, make dynamodb-init y gateway + ms2 + ms3 + ms6 en marcha
# (scripts/dev-services.sh start gateway ms2 ms3 ms6). Ver contracts/idempotency.md.
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8090}"
KC="${KEYCLOAK_URL:-http://localhost:8080}/realms/sigec/protocol/openid-connect/token"
fail=0

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() {
  curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' |
    python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
}
# post TOKEN RUTA CLAVE|- CUERPO  -> imprime "codigo|replay|retry-after|cuerpo"
post() {
  local tk="$1" path="$2" key="$3" body="$4" hdr=()
  [ "$key" != "-" ] && hdr=(-H "Idempotency-Key: $key")
  curl -s -D /tmp/idem.h -o /tmp/idem.b -X POST "$GW$path" -H "Authorization: Bearer $tk" "${hdr[@]}" \
    -H 'Content-Type: application/json' -d "$body"
  local code replay retry
  code=$(head -1 /tmp/idem.h | awk '{print $2}')
  replay=$(grep -i '^idempotent-replay' /tmp/idem.h | tr -d '\r' | awk '{print $2}')
  retry=$(grep -i '^retry-after' /tmp/idem.h | tr -d '\r' | awk '{print $2}')
  echo "$code|${replay:--}|${retry:--}|$(cat /tmp/idem.b)"
}
check() { # descripcion esperado obtenido
  if [ "$2" = "$3" ]; then printf '  ok   %s\n' "$1"; else printf '  FALLO %s (esperado %s, obtenido %s)\n' "$1" "$2" "$3"; fail=1; fi
}
field() { echo "$1" | cut -d'|' -f"$2"; }

TR=$(token recepcion); TC=$(token caja)

echo "== MS2: POST /api/pacientes"
KEY=$(uuid); DOC="I-$RANDOM$RANDOM"
BODY="{\"nombre\":\"Ana\",\"documento\":\"$DOC\",\"fechaNacimiento\":\"1990-05-01\"}"
check "sin cabecera -> 400" 400 "$(field "$(post "$TR" /api/pacientes - "$BODY")" 1)"
R1=$(post "$TR" /api/pacientes "$KEY" "$BODY"); check "primera -> 201" 201 "$(field "$R1" 1)"
R2=$(post "$TR" /api/pacientes "$KEY" "$BODY")
check "repetida -> 201 + Idempotent-Replay" "201|true" "$(field "$R2" 1)|$(field "$R2" 2)"
check "misma respuesta" "$(field "$R1" 4)" "$(field "$R2" 4)"
check "otro cuerpo, misma clave -> 422" 422 "$(field "$(post "$TR" /api/pacientes "$KEY" "{\"nombre\":\"X\",\"documento\":\"Z$RANDOM\",\"fechaNacimiento\":\"1990-05-01\"}")" 1)"
N=$(docker compose exec -T postgres psql -U sigec -d ms2_pacientes -tAc "select count(*) from pacientes where documento='$DOC'")
check "un solo paciente en la base" 1 "$N"

echo "== MS6: POST /api/facturacion/facturas"
KEY=$(uuid); F="{\"citaId\":\"$(uuid)\",\"pacienteId\":\"$(uuid)\",\"monto\":120}"
check "sin cabecera -> 400" 400 "$(field "$(post "$TC" /api/facturacion/facturas - "$F")" 1)"
R1=$(post "$TC" /api/facturacion/facturas "$KEY" "$F"); check "primera -> 201" 201 "$(field "$R1" 1)"
R2=$(post "$TC" /api/facturacion/facturas "$KEY" "$F")
check "repetida -> 201 + Idempotent-Replay" "201|true" "$(field "$R2" 1)|$(field "$R2" 2)"
check "misma respuesta" "$(field "$R1" 4)" "$(field "$R2" 4)"

echo "== MS3: POST /api/citas"
KEY=$(uuid); C="{\"pacienteId\":\"$(uuid)\",\"medicoId\":\"$(uuid)\",\"especialidad\":\"general\",\"fechaHora\":\"2026-12-01T10:00:00Z\"}"
check "sin cabecera -> 400" 400 "$(field "$(post "$TR" /api/citas - "$C")" 1)"
check "rol caja -> 403" 403 "$(field "$(post "$TC" /api/citas "$KEY" "$C")" 1)"
R1=$(post "$TR" /api/citas "$KEY" "$C"); check "primera -> 202" 202 "$(field "$R1" 1)"
R2=$(post "$TR" /api/citas "$KEY" "$C")
check "repetida -> 202 + Idempotent-Replay" "202|true" "$(field "$R2" 1)|$(field "$R2" 2)"
check "mismo citaId" "$(field "$R1" 4)" "$(field "$R2" 4)"

echo "== Peticiones simultaneas con la misma clave (MS3)"
KEY=$(uuid); C2="{\"pacienteId\":\"$(uuid)\",\"medicoId\":\"$(uuid)\",\"especialidad\":\"general\",\"fechaHora\":\"2026-12-02T10:00:00Z\"}"
for i in 1 2 3 4 5; do
  (curl -s -o /dev/null -w '%{http_code}\n' -X POST "$GW/api/citas" -H "Authorization: Bearer $TR" -H "Idempotency-Key: $KEY" -H 'Content-Type: application/json' -d "$C2" >/tmp/idem.par.$i) &
done
wait
CODES=$(cat /tmp/idem.par.* | sort | uniq -c | awk '{printf "%sx%s ", $1, $2}')
echo "  codigos: $CODES  (solo una ejecucion; las demas 409 o repeticion 202)"
NEXEC=$(cat /tmp/idem.par.* | grep -c '^202$')
[ "$NEXEC" -ge 1 ] && printf '  ok   al menos una respuesta 202\n' || { printf '  FALLO ninguna 202\n'; fail=1; }
rm -f /tmp/idem.par.*

echo "== CORS expone las cabeceras de idempotencia"
EXPOSE=$(curl -s -D - -o /dev/null -X POST "$GW/api/citas" -H "Origin: http://localhost:5173" -H "Authorization: Bearer $TR" -H "Idempotency-Key: $KEY" -H 'Content-Type: application/json' -d "$C2" | grep -i '^access-control-expose' | tr -d '\r')
check "Access-Control-Expose-Headers" "yes" "$(echo "$EXPOSE" | grep -qi 'Idempotent-Replay' && echo yes || echo no)"

[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
