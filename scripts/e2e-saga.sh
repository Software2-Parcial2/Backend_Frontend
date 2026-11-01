#!/usr/bin/env bash
# Prueba de extremo a extremo de la SAGA de citas (docs/saga-citas.md), con token real de Keycloak.
#   (a) cita feliz: CONFIRMADA + factura PROVISIONAL en MS6 + notificacion enviada
#   (b) mismo horario dos veces (en serie y en paralelo): el segundo se rechaza con 409
#   (c) cobro rechazado: cita CANCELADA y el horario vuelve a LIBRE (y se puede reservar)
#   (d) misma Idempotency-Key: no se crea otra cita
#   (e) la reserva vence (TTL corto): el horario se puede volver a reservar; la cita que lo perdio queda ANULADA
#   (f) MS6 caido durante un paso: reintentos, compensacion (CANCELADA, horario LIBRE) y cobro anulado al volver
#   (g) fallo de notificacion: la cita NO se anula (CONFIRMADA con notificacion PENDIENTE)
#
# Requisitos: docker compose up -d, make dynamodb-init, make rabbitmq-declare, pnpm install y las migraciones de MS6.
# Arranca y detiene gateway, ms3, ms8, el poller del outbox y los procesos de MS6 (scripts/dev-services.sh).
# Duracion aproximada: 3-4 minutos.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
DEV="$ROOT/scripts/dev-services.sh"
GW="${GATEWAY_URL:-http://localhost:8090}"
KC="http://localhost:8080/realms/sigec/protocol/openid-connect/token"
BLOQUEADO="00000000-0000-4000-8000-00000000dead"     # MS6 siempre rechaza su cobro
NOTIF_FALLA="00000000-0000-4000-8000-0000000fa11e"   # MS8 (NOTIF_FAIL_PACIENTES) siempre falla al notificar
fail=0
pass=0

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
section() { printf '\n== %s\n' "$1"; }

# Horarios unicos por ejecucion: medico nuevo cada vez => nunca chocan con corridas anteriores.
nuevo_medico() { uuid; }
# ISO UTC con milisegundos, N minutos dentro de ~40 dias.
fecha() { date -u -d "+40 days +$1 minutes" '+%Y-%m-%dT%H:%M:00.000Z'; }

body() { # paciente medico especialidad fecha
  printf '{"pacienteId":"%s","medicoId":"%s","especialidad":"%s","fechaHora":"%s"}' "$1" "$2" "$3" "$4"
}
# post_cita TOKEN CLAVE|- CUERPO  ->  "codigo|replay|citaId"
post_cita() {
  local tk="$1" key="$2" b="$3" hdr=()
  [ "$key" != "-" ] && hdr=(-H "Idempotency-Key: $key")
  # Archivos temporales propios de cada llamada: se invoca tambien en paralelo (caso b).
  local th tb; th=$(mktemp); tb=$(mktemp)
  curl -s -D "$th" -o "$tb" -X POST "$GW/api/citas" -H "Authorization: Bearer $tk" "${hdr[@]}" -H 'Content-Type: application/json' -d "$b"
  local code replay id
  code=$(head -1 "$th" | awk '{print $2}')
  replay=$(grep -i '^idempotent-replay' "$th" | tr -d '\r' | awk '{print $2}')
  id=$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("citaId",""))' "$tb" 2>/dev/null)
  rm -f "$th" "$tb"
  echo "$code|${replay:--}|$id"
}
f() { echo "$1" | cut -d'|' -f"$2"; }
cita_json() { curl -s "$GW/api/citas/$1" -H "Authorization: Bearer $TR"; }
cita_field() { cita_json "$1" | python3 -c "import sys,json;d=json.load(sys.stdin);v=d
for k in '$2'.split('.'): v=v.get(k) if isinstance(v,dict) else None
print('' if v is None else v)"; }
wait_cita() { # citaId campo esperado timeout-s
  local t=0; while [ "$t" -lt "$4" ]; do [ "$(cita_field "$1" "$2")" = "$3" ] && return 0; sleep 1; t=$((t + 1)); done; return 1
}
horario() { node scripts/saga-inspect.mjs horario "$1" "$2" 2>/dev/null; }
db6() { docker compose exec -T postgres psql -U sigec -d ms6_facturacion -tAc "$1"; }
facturas_cita() { db6 "select string_agg(estado, ',' order by estado) from facturas where cita_id='$1'"; }
eventos() { cita_json "$1" | python3 -c 'import sys,json;print(",".join(p["evento"] for p in json.load(sys.stdin)["pasos"]))'; }

restart_ms3() { "$DEV" stop ms3 >/dev/null 2>&1; sleep 2; env "$@" "$DEV" start ms3 >/dev/null 2>&1; }

cleanup() {
  "$DEV" stop gateway ms3 ms8 >/dev/null 2>&1
  "$DEV" workers-stop >/dev/null 2>&1
  "$DEV" poller-stop >/dev/null 2>&1
}
trap cleanup EXIT

section "Preparacion"
cleanup
export NOTIF_FAIL_PACIENTES="$NOTIF_FALLA"
"$DEV" start gateway ms8 | sed 's/^/  /'
restart_ms3 SAGA_STEP_TIMEOUT_MS=30000 SAGA_RESERVA_TTL_SEGUNDOS=600
"$DEV" poller-start | sed 's/^/  /'
"$DEV" workers-start | sed 's/^/  /'
sleep 3
TR=$(token recepcion); TP=$(token paciente); TC=$(token caja)
echo "  servicios: $("$DEV" status | awk '$3==200{print $1}' | tr '\n' ' ')"

# ---------------------------------------------------------------------------------------------------
section "(a) Cita feliz: CONFIRMADA, factura PROVISIONAL y notificacion enviada"
M=$(nuevo_medico); H=$(fecha 5); P=$(uuid)
R=$(post_cita "$TR" "$(uuid)" "$(body "$P" "$M" general "$H")")
check "POST /api/citas -> 202" 202 "$(f "$R" 1)"
A=$(f "$R" 3)
check "recien creada ya figura reservada o en cobro" "ok" "$(case "$(cita_field "$A" estado)" in RESERVADA|COBRO_PROVISIONAL|CONFIRMADA) echo ok;; *) echo no;; esac)"
check "cita CONFIRMADA" ok "$(wait_cita "$A" estado CONFIRMADA 40 && echo ok || echo "$(cita_field "$A" estado)")"
check "saga COMPLETADA" COMPLETADA "$(cita_field "$A" saga.estado)"
check "notificacion ENVIADA" ENVIADA "$(cita_field "$A" notificacion)"
check "factura PROVISIONAL en MS6" PROVISIONAL "$(facturas_cita "$A")"
check "el horario queda CONFIRMADO" CONFIRMADO "$(horario "$M" "$H")"
check "MS8 registro la notificacion (via API, ENVIADA)" ENVIADA "$(curl -s "$GW/api/notificaciones?citaId=$A" -H "Authorization: Bearer $TR" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["estado"] if d else "")')"
check "GET /api/citas/{id} muestra los pasos" ok "$(eventos "$A" | grep -q COBRO_REGISTRADO && echo ok || echo no)"

# ---------------------------------------------------------------------------------------------------
section "(b) El mismo horario no se puede reservar dos veces"
check "segunda reserva del horario (a) -> 409" 409 "$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M" general "$H")")" 1)"
M2=$(nuevo_medico); H2=$(fecha 6)
( post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M2" general "$H2")" >/tmp/e2e.par.1 ) &
( post_cita "$TP" "$(uuid)" "$(body "$(uuid)" "$M2" general "$H2")" >/tmp/e2e.par.2 ) &
wait
check "dos peticiones simultaneas: una 202 y otra 409" "202,409" "$(cat /tmp/e2e.par.1 /tmp/e2e.par.2 | cut -d'|' -f1 | sort | paste -sd,)"
rm -f /tmp/e2e.par.*
check "otro horario del mismo medico si se puede" 202 "$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M" general "$(fecha 7)")")" 1)"
check "rol sin permiso (caja) -> 403" 403 "$(f "$(post_cita "$TC" "$(uuid)" "$(body "$(uuid)" "$M" general "$(fecha 8)")")" 1)"
check "sin Idempotency-Key -> 400" 400 "$(f "$(post_cita "$TR" - "$(body "$(uuid)" "$M" general "$(fecha 9)")")" 1)"

# ---------------------------------------------------------------------------------------------------
section "(c) Cobro rechazado: CANCELADA y el horario vuelve a LIBRE"
M3=$(nuevo_medico); H3=$(fecha 10)
R=$(post_cita "$TR" "$(uuid)" "$(body "$BLOQUEADO" "$M3" general "$H3")")
check "POST -> 202 (el horario se reserva)" 202 "$(f "$R" 1)"
C=$(f "$R" 3)
check "cita CANCELADA" ok "$(wait_cita "$C" estado CANCELADA 30 && echo ok || echo "$(cita_field "$C" estado)")"
check "motivo del fallo menciona el rechazo" ok "$(cita_field "$C" motivoFallo | grep -qi bloqueado && echo ok || echo no)"
check "no quedo factura" "" "$(facturas_cita "$C")"
check "el horario esta LIBRE" LIBRE "$(horario "$M3" "$H3")"
check "compensaciones ejecutadas en orden" "LIBERAR_HORARIO,NOTIFICAR_CANCELACION" "$(cita_json "$C" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["saga"]["compensaciones"]))')"
check "el horario liberado se puede reservar de nuevo" 202 "$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M3" general "$H3")")" 1)"

# ---------------------------------------------------------------------------------------------------
section "(d) La misma Idempotency-Key no crea otra cita"
M4=$(nuevo_medico); H4=$(fecha 11); K=$(uuid); B4=$(body "$(uuid)" "$M4" general "$H4")
R1=$(post_cita "$TR" "$K" "$B4"); R2=$(post_cita "$TR" "$K" "$B4")
check "primera -> 202" 202 "$(f "$R1" 1)"
check "repetida -> 202 con Idempotent-Replay" "202|true" "$(f "$R2" 1)|$(f "$R2" 2)"
check "mismo citaId" "$(f "$R1" 3)" "$(f "$R2" 3)"
D=$(f "$R1" 3)
wait_cita "$D" estado CONFIRMADA 40
check "una sola factura para esa cita" 1 "$(db6 "select count(*) from facturas where cita_id='$D'")"
check "misma clave con otro cuerpo -> 422" 422 "$(f "$(post_cita "$TR" "$K" "$(body "$(uuid)" "$M4" general "$(fecha 12)")")" 1)"

# ---------------------------------------------------------------------------------------------------
section "(g) Fallo de notificacion: la cita NO se anula"
M7=$(nuevo_medico); H7=$(fecha 13)
R=$(post_cita "$TR" "$(uuid)" "$(body "$NOTIF_FALLA" "$M7" general "$H7")"); G=$(f "$R" 3)
check "cita CONFIRMADA pese al fallo" ok "$(wait_cita "$G" estado CONFIRMADA 40 && echo ok || echo "$(cita_field "$G" estado)")"
check "notificacion PENDIENTE (se reintenta aparte)" PENDIENTE "$(cita_field "$G" notificacion)"
check "el cobro sigue PROVISIONAL (no se anulo)" PROVISIONAL "$(facturas_cita "$G")"
check "el horario sigue CONFIRMADO" CONFIRMADO "$(horario "$M7" "$H7")"

# ---------------------------------------------------------------------------------------------------
section "(e) La reserva vence: el horario se puede volver a reservar"
"$DEV" workers-stop >/dev/null 2>&1          # MS6 no consume: la SAGA no avanza
restart_ms3 SAGA_STEP_TIMEOUT_MS=60000 SAGA_RESERVA_TTL_SEGUNDOS=6
M5=$(nuevo_medico); H5=$(fecha 20)
X=$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M5" general "$H5")")" 3)
check "cita X reservada (sin avanzar, MS6 parado)" RESERVADA "$(cita_field "$X" estado)"
check "mientras la reserva esta vigente el horario esta RESERVADO" RESERVADO "$(horario "$M5" "$H5")"
check "...y no se puede reservar (409)" 409 "$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M5" general "$H5")")" 1)"
sleep 8
check "pasado el TTL el horario cuenta como LIBRE (sin esperar al TTL de DynamoDB)" LIBRE "$(horario "$M5" "$H5")"
R=$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M5" general "$H5")")
check "se puede reservar de nuevo -> 202" 202 "$(f "$R" 1)"
Y=$(f "$R" 3)
"$DEV" workers-start >/dev/null 2>&1         # MS6 vuelve: procesa X y luego Y
check "Y (la nueva reserva) llega a CONFIRMADA" ok "$(wait_cita "$Y" estado CONFIRMADA 60 && echo ok || echo "$(cita_field "$Y" estado)")"
check "X (reserva perdida) queda ANULADA" ok "$(wait_cita "$X" estado ANULADA 60 && echo ok || echo "$(cita_field "$X" estado)")"
check "motivo de X indica la reserva perdida" ok "$(cita_field "$X" motivoFallo | grep -qi reserva && echo ok || echo no)"
check "el cobro de X se anula en MS6" ANULADA "$(facturas_cita "$X")"
check "el horario pertenece a Y (CONFIRMADO)" CONFIRMADO "$(horario "$M5" "$H5")"

# ---------------------------------------------------------------------------------------------------
section "(f) MS6 caido durante un paso: reintentos y compensacion"
"$DEV" workers-stop >/dev/null 2>&1
restart_ms3 SAGA_STEP_TIMEOUT_MS=3000 SAGA_MAX_ATTEMPTS=3 SAGA_BACKOFF_BASE_MS=500 SAGA_RESERVA_TTL_SEGUNDOS=600
M6=$(nuevo_medico); H6=$(fecha 30)
Z=$(f "$(post_cita "$TR" "$(uuid)" "$(body "$(uuid)" "$M6" general "$H6")")" 3)
check "cita Z reservada" RESERVADA "$(cita_field "$Z" estado)"
check "tras los reintentos la cita queda CANCELADA" ok "$(wait_cita "$Z" estado CANCELADA 60 && echo ok || echo "$(cita_field "$Z" estado)")"
check "hubo 2 reintentos antes de compensar" 2 "$(eventos "$Z" | tr ',' '\n' | grep -c TIMEOUT_REINTENTO)"
check "motivo: timeout del cobro tras 3 intentos" ok "$(cita_field "$Z" motivoFallo | grep -q 'tras 3 intentos' && echo ok || echo no)"
check "compensaciones en orden inverso" "ANULAR_COBRO,LIBERAR_HORARIO,NOTIFICAR_CANCELACION" "$(cita_json "$Z" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["saga"]["compensaciones"]))')"
check "el horario esta LIBRE" LIBRE "$(horario "$M6" "$H6")"
check "anulacion del cobro pendiente de MS6" PENDIENTE "$(cita_field "$Z" saga.anulacionCobro)"
"$DEV" workers-start >/dev/null 2>&1         # MS6 vuelve: procesa solicitudes atrasadas y la anulacion
check "al volver MS6 no queda ningun cobro vigente de Z" ok "$(for _ in $(seq 1 45); do [ "$(db6 "select count(*) from facturas where cita_id='$Z' and estado <> 'ANULADA'")" = 0 ] && [ -n "$(facturas_cita "$Z")" ] && { echo ok; break; }; sleep 1; done)"
check "...y el cobro figura ANULADO" ANULADA "$(facturas_cita "$Z")"
check "MS3 confirma la anulacion del cobro" CONFIRMADA "$(for _ in $(seq 1 30); do v=$(cita_field "$Z" saga.anulacionCobro); [ "$v" = CONFIRMADA ] && break; sleep 1; done; echo "$v")"
check "el horario sigue LIBRE" LIBRE "$(horario "$M6" "$H6")"

printf '\n== Resultado: %d comprobaciones correctas, %d fallidas\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS (logs en ${SIGEC_LOGS:-/tmp/sigec-logs})"; exit 1; }
