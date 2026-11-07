#!/usr/bin/env bash
# E2E de notificaciones: SAGA de citas -> MS8 -> n8n -> correo/Telegram, con MS8 y n8n REALES.
#
#  Parte 1 (siempre): proveedores SIMULADOS (Mailtrap y Telegram de scripts/mock-providers.mjs).
#     paciente con email -> cita -> correo con destinatario y texto correctos; vinculacion de Telegram con codigo de un solo uso;
#     canal TELEGRAM sin datos clinicos; fallo del proveedor -> reintentos -> FALLIDA + alerta interna, y la cita sigue CONFIRMADA.
#  Parte 2 (solo con credenciales de Mailtrap en .env): la cita dispara un correo REAL visible en la bandeja de Mailtrap.
#     Si faltan MAILTRAP_API_TOKEN / MAILTRAP_INBOX_ID / MAILTRAP_ACCOUNT_ID se OMITE (no se inventan resultados).
#
# Requisitos: docker compose up -d, make dynamodb-init rabbitmq-declare n8n-import.  Arranca/detiene gateway, ms2, ms3, ms6, ms8.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
DEV="$ROOT/scripts/dev-services.sh"
GW="http://localhost:8090"
KC="http://localhost:8080/realms/sigec/protocol/openid-connect/token"
MOCK="http://localhost:9099"
fail=0; pass=0; omitidas=0
mkdir -p /tmp/sigec-logs

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
section() { printf '\n== %s\n' "$1"; }
fecha() { date -u -d "+50 days +$1 minutes" '+%Y-%m-%dT%H:%M:00.000Z'; }
api() { # METODO RUTA TOKEN [CUERPO] -> codigo; cuerpo en /tmp/e2en.body
  local m="$1" path="$2" tk="$3" body="${4:-}" args=()
  [ -n "$body" ] && args=(-H 'Content-Type: application/json' -H "Idempotency-Key: $(uuid)" -d "$body")
  [ "$m" = GET ] && args=()
  curl -s -o /tmp/e2en.body -w '%{http_code}' -X "$m" "$GW$path" -H "Authorization: Bearer $tk" "${args[@]}"
}
jget() { python3 -c "import json,sys;d=json.load(open('/tmp/e2en.body'));v=d
for k in '$1'.split('.'): v=v.get(k) if isinstance(v,dict) else None
print('' if v is None else v)"; }
cita_campo() { curl -s "$GW/api/citas/$1" -H "Authorization: Bearer $TR" | python3 -c "import sys,json;d=json.load(sys.stdin);v=d
for k in '$2'.split('.'): v=v.get(k) if isinstance(v,dict) else None
print('' if v is None else v)"; }
esperar() { local t=0; while [ "$t" -lt "$2" ]; do [ "$(eval "$1")" = "$3" ] && return 0; sleep 1; t=$((t + 1)); done; return 1; }
mocklog() { curl -s "$MOCK/__mock/log"; }
mockcount() { mocklog | python3 -c "import sys,json;print(sum(1 for e in json.load(sys.stdin) if $1))"; }

cleanup() {
  kill "$MOCK_PID" 2>/dev/null
  "$DEV" stop gateway ms2 ms3 ms6 ms8 >/dev/null 2>&1; "$DEV" workers-stop >/dev/null 2>&1; "$DEV" poller-stop >/dev/null 2>&1
  docker compose up -d n8n >/dev/null 2>&1    # n8n vuelve a la configuracion normal del .env
}
trap cleanup EXIT

section "Preparacion (n8n y MS8 reales; Mailtrap y Telegram simulados)"
"$DEV" stop gateway ms2 ms3 ms6 ms8 >/dev/null 2>&1; "$DEV" workers-stop >/dev/null 2>&1
node scripts/mock-providers.mjs 9099 >/tmp/sigec-logs/mock-providers.log 2>&1 &
MOCK_PID=$!
sleep 1
env MAILTRAP_API_URL=http://host.docker.internal:9099 MAILTRAP_API_TOKEN=test-token MAILTRAP_INBOX_ID=42 \
    TELEGRAM_API_URL=http://host.docker.internal:9099 TELEGRAM_BOT_TOKEN=123:TEST TELEGRAM_ALERT_CHAT_ID=-1001 \
    MS8_URL_FROM_N8N=http://host.docker.internal:3008 MAIL_FROM=sigec@clinica.test \
    docker compose up -d --force-recreate n8n >/dev/null 2>&1
for _ in $(seq 1 60); do curl -sf http://localhost:5678/healthz >/dev/null && break; sleep 2; done
export NOTIF_SENDER=n8n N8N_BASE_URL=http://localhost:5678 NOTIF_MAX_INTENTOS=3 NOTIF_BACKOFF_BASE_MS=1000 DLQ_MONITOR_MS=3600000
"$DEV" start gateway ms8 ms2 ms3 ms6 | sed 's/^/  /'
"$DEV" poller-start | sed 's/^/  /'; "$DEV" workers-start | sed 's/^/  /'
sleep 3
TR=$(token recepcion); TP=$(token paciente)
# El offset del bot se conserva en n8n entre ejecuciones: los update_id deben crecer siempre (se basan en la hora).
UPD=$(date +%s)

# ---------------------------------------------------------------------------------------------------------------
section "Parte 1.1 - Un paciente con email recibe el correo de la cita (MS8 -> n8n -> Mailtrap simulado)"
EMAIL="sigec-e2e-$RANDOM$RANDOM@example.com"
check "alta del paciente (MS2) -> 201" 201 "$(api POST /api/pacientes "$TR" "{\"nombre\":\"Ana Prueba\",\"documento\":\"N-$RANDOM$RANDOM\",\"fechaNacimiento\":\"1990-05-01\",\"email\":\"$EMAIL\"}")"
PAC=$(jget id)
check "MS8 recibe paciente.creado y guarda el contacto" "$EMAIL" "$(esperar "api GET /api/notificaciones/preferencias/$PAC $TR >/dev/null; jget email" 30 "$EMAIL" && echo "$EMAIL" || (api GET /api/notificaciones/preferencias/$PAC "$TR" >/dev/null; jget email))"
MED=$(uuid)
check "POST /api/citas -> 202" 202 "$(api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$MED\",\"especialidad\":\"general\",\"fechaHora\":\"$(fecha 1)\"}")"
C1=$(jget citaId)
check "la cita queda CONFIRMADA" ok "$(esperar "cita_campo $C1 estado" 60 CONFIRMADA && echo ok || cita_campo "$C1" estado)"
check "notificacion ENVIADA" ENVIADA "$(esperar "cita_campo $C1 notificacion" 30 ENVIADA && echo ENVIADA || cita_campo "$C1" notificacion)"
check "el correo llego al email del paciente" "$EMAIL" "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='email'];print(e[0]['to'] if e else '')")"
check "asunto y saludo en espanol con el nombre" "Tu cita esta confirmada|Hola Ana Prueba" "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='email'][0];print(e['subject']+'|'+e['text'][:15])")"
check "el correo NO incluye especialidad ni medico" ok "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='email'][0];t=(e['text']+e['html']).lower();print('ok' if 'general' not in t and 'medico' not in t and '$MED' not in t else 'no')")"
check "MS8 registro la notificacion ENVIADA (API)" ENVIADA "$(api GET "/api/notificaciones?citaId=$C1" "$TR" >/dev/null; python3 -c "import json;d=json.load(open('/tmp/e2en.body'))['items'];print(d[0]['estado'] if d else '')")"

# ---------------------------------------------------------------------------------------------------------------
section "Parte 1.2 - Vinculacion de Telegram con codigo de un solo uso"
check "preferencia inicial: solo EMAIL" EMAIL "$(api GET /api/notificaciones/preferencias/$PAC "$TR" >/dev/null; python3 -c "import json;print(','.join(json.load(open('/tmp/e2en.body'))['canales']))")"
check "se genera el codigo (201)" 201 "$(api POST /api/notificaciones/telegram/vinculo "$TR" "{\"pacienteId\":\"$PAC\"}")"
CODIGO=$(jget codigo)
check "el codigo tiene 8 caracteres" 8 "${#CODIGO}"
curl -s -X POST "$MOCK/__mock/updates" -d "[{\"update_id\":$((UPD + 1)),\"message\":{\"chat\":{\"id\":4242},\"text\":\"/start $CODIGO\"}}]" -o /dev/null
check "el bot (workflow) vincula el chat" ok "$(esperar "api GET /api/notificaciones/preferencias/$PAC $TR >/dev/null; jget telegramVinculado" 30 True && echo ok || echo no)"
check "...y TELEGRAM se agrega a las preferencias" "EMAIL,TELEGRAM" "$(api GET /api/notificaciones/preferencias/$PAC "$TR" >/dev/null; python3 -c "import json;print(','.join(json.load(open('/tmp/e2en.body'))['canales']))")"
check "el bot respondio 'vinculada' al chat 4242" ok "$(esperar "mockcount \"e['kind']=='telegram' and e['chat_id']=='4242' and 'vinculada' in e['text']\"" 20 1 && echo ok || echo no)"
curl -s -X POST "$MOCK/__mock/updates" -d "[{\"update_id\":$((UPD + 2)),\"message\":{\"chat\":{\"id\":9999},\"text\":\"/start $CODIGO\"}}]" -o /dev/null
sleep 12
check "el mismo codigo NO se puede reutilizar desde otro chat" ok "$(mocklog | python3 -c "import sys,json;print('ok' if any(e['kind']=='telegram' and e['chat_id']=='9999' and 'no es valido' in e['text'] for e in json.load(sys.stdin)) else 'no')")"
check "un paciente NO puede pedir un codigo para otro paciente (403)" 403 "$(api POST /api/notificaciones/telegram/vinculo "$TP" "{\"pacienteId\":\"$PAC\"}")"
check "...pero si para si mismo (201)" 201 "$(api POST /api/notificaciones/telegram/vinculo "$TP" '{}')"

section "Parte 1.3 - Con el paciente vinculado, la cita avisa por correo Y por Telegram (sin datos clinicos)"
curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
check "POST /api/citas -> 202" 202 "$(api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$MED\",\"especialidad\":\"cardiologia\",\"fechaHora\":\"$(fecha 2)\"}")"
C2=$(jget citaId)
check "cita CONFIRMADA y notificacion ENVIADA" ENVIADA "$(esperar "cita_campo $C2 notificacion" 60 ENVIADA && echo ENVIADA || cita_campo "$C2" notificacion)"
check "llego el correo" 1 "$(mockcount "e['kind']=='email'")"
check "llego el mensaje de Telegram al chat vinculado (4242)" 1 "$(mockcount "e['kind']=='telegram' and e['chat_id']=='4242' and 'confirmada' in e['text'].lower()")"
check "el mensaje de Telegram no incluye especialidad ni medico" ok "$(mocklog | python3 -c "import sys,json;t=[x for x in json.load(sys.stdin) if x['kind']=='telegram' and x['chat_id']=='4242'][0]['text'].lower();print('ok' if 'cardio' not in t and 'medico' not in t else 'no')")"

# ---------------------------------------------------------------------------------------------------------------
section "Parte 1.4 - Fallo del proveedor: reintentos, FALLIDA y alerta interna; la cita NO se anula"
curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
# Solo falla el correo (Telegram sigue vivo: por ahi viaja la alerta interna).
curl -s -X POST "$MOCK/__mock/fail" -d '{"email":true}' -o /dev/null
check "POST /api/citas -> 202" 202 "$(api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$MED\",\"especialidad\":\"general\",\"fechaHora\":\"$(fecha 3)\"}")"
C3=$(jget citaId)
check "MS8 reintenta y termina FALLIDA (3 intentos)" FALLIDA "$(esperar "api GET '/api/notificaciones?citaId=$C3' $TR >/dev/null; python3 -c \"import json;d=json.load(open('/tmp/e2en.body'))['items'];print(d[0]['estado'] if d else '')\"" 60 FALLIDA && echo FALLIDA || echo no)"
check "...con 3 intentos" 3 "$(api GET "/api/notificaciones?citaId=$C3" "$TR" >/dev/null; python3 -c "import json;print(json.load(open('/tmp/e2en.body'))['items'][0]['intentos'])")"
check "la cita queda CONFIRMADA (un fallo de notificacion no la anula)" ok "$(esperar "cita_campo $C3 estado" 60 CONFIRMADA && echo ok || cita_campo "$C3" estado)"
check "su notificacion figura PENDIENTE en la cita" PENDIENTE "$(esperar "cita_campo $C3 notificacion" 30 PENDIENTE && echo PENDIENTE || cita_campo "$C3" notificacion)"
check "se disparo la alerta interna al chat de administradores" ok "$(esperar "mockcount \"e['kind']=='telegram' and e['chat_id']=='-1001' and 'FALLIDA' in e['text']\"" 20 1 && echo ok || echo no)"
curl -s -X POST "$MOCK/__mock/fail" -d '{"email":false}' -o /dev/null

# ---------------------------------------------------------------------------------------------------------------
section "Parte 2 - Correo REAL en la bandeja de Mailtrap"
if [ -n "${MAILTRAP_API_TOKEN:-}" ] && [ -n "${MAILTRAP_INBOX_ID:-}" ] && [ -n "${MAILTRAP_ACCOUNT_ID:-}" ]; then
  env MAILTRAP_API_URL=https://sandbox.api.mailtrap.io \
      docker compose up -d --force-recreate n8n >/dev/null 2>&1   # n8n con el .env real (sin simulados)
  for _ in $(seq 1 60); do curl -sf http://localhost:5678/healthz >/dev/null && break; sleep 2; done
  EMAILR="sigec-real-$RANDOM$RANDOM@example.com"
  api POST /api/pacientes "$TR" "{\"nombre\":\"Prueba Mailtrap\",\"documento\":\"M-$RANDOM$RANDOM\",\"fechaNacimiento\":\"1990-05-01\",\"email\":\"$EMAILR\"}" >/dev/null; PR=$(jget id)
  esperar "api GET /api/notificaciones/preferencias/$PR $TR >/dev/null; jget email" 30 "$EMAILR"
  api POST /api/citas "$TR" "{\"pacienteId\":\"$PR\",\"medicoId\":\"$MED\",\"especialidad\":\"general\",\"fechaHora\":\"$(fecha 4)\"}" >/dev/null; CR=$(jget citaId)
  check "la cita queda CONFIRMADA" ok "$(esperar "cita_campo $CR estado" 60 CONFIRMADA && echo ok || echo no)"
  check "el correo aparece en la bandeja de Mailtrap" ok "$(for _ in $(seq 1 30); do curl -s -H "Authorization: Bearer $MAILTRAP_API_TOKEN" "https://mailtrap.io/api/accounts/$MAILTRAP_ACCOUNT_ID/inboxes/$MAILTRAP_INBOX_ID/messages?search=$EMAILR" | grep -q "$EMAILR" && { echo ok; break; }; sleep 2; done)"
else
  omitidas=$((omitidas + 1))
  echo "  OMITIDA: faltan MAILTRAP_API_TOKEN, MAILTRAP_INBOX_ID y/o MAILTRAP_ACCOUNT_ID en .env."
  echo "           La Parte 1 ya verifico el flujo completo contra un Mailtrap SIMULADO, pero eso no prueba la API real de Mailtrap."
  echo "           Para ejecutarla: crea un inbox en Mailtrap (Email Testing), copia el token, el id del inbox y el id de la cuenta al .env."
fi

printf '\n== Resultado: %d correctas, %d fallidas, %d parte(s) omitida(s)\n' "$pass" "$fail" "$omitidas"
[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS (logs en /tmp/sigec-logs)"; exit 1; }
