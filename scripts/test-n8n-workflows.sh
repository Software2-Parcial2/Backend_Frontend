#!/usr/bin/env bash
# Prueba los 4 workflows de n8n contra servidores SIMULADOS de Mailtrap, Telegram y MS8 (sin credenciales ni internet):
#   enviar-notificacion (secreto, canal, EMAIL, TELEGRAM, fallo del proveedor), alerta-interna, recordatorio-cita
#   (disparo manual y cita por cita) y telegram-vinculacion (/start <codigo>, codigo invalido, mensajes ignorados, offset).
# Recrea el contenedor de n8n apuntando a los simulados y, al terminar, lo deja con la configuracion normal del .env.
# Requisitos: docker compose up -d, make n8n-import, node.   Uso: scripts/test-n8n-workflows.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
N8N="http://localhost:5678/webhook"
MOCK="http://localhost:9099"
fail=0; pass=0

check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
code() { curl -s -o /tmp/n8n.body -w '%{http_code}' -X POST "$@"; }
# webhook RUTA SECRETO CUERPO
hook() { code "$N8N/$1" -H "x-sigec-secret: $2" -H 'content-type: application/json' -d "$3"; }
mocklog() { curl -s "$MOCK/__mock/log"; }
count() { mocklog | python3 -c "import sys,json;print(sum(1 for e in json.load(sys.stdin) if $1))"; }
wait_count() { local t=0; while [ "$t" -lt "$3" ]; do [ "$(count "$1")" -ge "$2" ] && return 0; sleep 1; t=$((t + 1)); done; return 1; }

cleanup() {
  kill "$MOCK_PID" 2>/dev/null
  docker compose up -d n8n >/dev/null 2>&1   # vuelve a la configuracion normal (.env)
}
trap cleanup EXIT

echo "== Preparacion: simulados en :9099 y n8n apuntando a ellos"
node scripts/mock-providers.mjs 9099 >/tmp/sigec-logs/mock-providers.log 2>&1 &
MOCK_PID=$!
sleep 1
env MAILTRAP_API_URL=http://host.docker.internal:9099 MAILTRAP_API_TOKEN=test-token MAILTRAP_INBOX_ID=42 \
    TELEGRAM_API_URL=http://host.docker.internal:9099 TELEGRAM_BOT_TOKEN=123:TEST TELEGRAM_ALERT_CHAT_ID=-1001 \
    MS8_URL_FROM_N8N=http://host.docker.internal:9099 MAIL_FROM=sigec@clinica.test \
    docker compose up -d --force-recreate n8n >/dev/null 2>&1
for _ in $(seq 1 60); do curl -sf http://localhost:5678/healthz >/dev/null && break; sleep 2; done
sleep 4
check "n8n responde" 200 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5678/healthz)"
check "workflows publicados" 4 "$(docker compose exec -T n8n n8n list:workflow 2>/dev/null | grep -c '^sigec')"

echo "== a) enviar-notificacion"
EMAIL='{"canal":"EMAIL","destinatario":"ana@example.com","plantilla":"cita-confirmada","datos":{"asunto":"Tu cita esta confirmada","texto":"Hola Ana","html":"<p>Hola Ana</p>"},"notificacionId":"n-1"}'
check "sin cabecera de secreto -> 401" 401 "$(code "$N8N/enviar-notificacion" -H 'content-type: application/json' -d "$EMAIL")"
check "secreto incorrecto -> 401" 401 "$(hook enviar-notificacion incorrecto "$EMAIL")"
check "canal no soportado (SMS) -> 400" 400 "$(hook enviar-notificacion "$N8N_WEBHOOK_SECRET" '{"canal":"SMS","destinatario":"1","datos":{}}')"
check "EMAIL -> 200" 200 "$(hook enviar-notificacion "$N8N_WEBHOOK_SECRET" "$EMAIL")"
check "...y responde ok:true con el notificacionId" "True|n-1" "$(python3 -c "import json;d=json.load(open('/tmp/n8n.body'));print(f\"{d['ok']}|{d['notificacionId']}\")")"
check "el correo llego a Mailtrap (simulado) con destinatario, asunto, texto y html" "ana@example.com|Tu cita esta confirmada|Hola Ana|<p>Hola Ana</p>|sigec@clinica.test|42" \
  "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='email'][0];print('|'.join([e['to'],e['subject'],e['text'],e['html'],e['from'],e['inbox']]))")"
TG='{"canal":"TELEGRAM","destinatario":"555","plantilla":"cita-confirmada","datos":{"asunto":"x","texto":"Cita confirmada: martes"},"notificacionId":"n-2"}'
check "TELEGRAM -> 200" 200 "$(hook enviar-notificacion "$N8N_WEBHOOK_SECRET" "$TG")"
check "el mensaje llego al chat correcto (simulado)" "555|Cita confirmada: martes" "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='telegram'][0];print(e['chat_id']+'|'+e['text'])")"
curl -s -X POST "$MOCK/__mock/fail" -d '{"email":true,"telegram":true}' -o /dev/null
check "fallo del proveedor de correo -> 502" 502 "$(hook enviar-notificacion "$N8N_WEBHOOK_SECRET" "$EMAIL")"
check "...con ok:false y el error" False "$(python3 -c "import json;print(json.load(open('/tmp/n8n.body'))['ok'])")"
check "fallo de Telegram -> 502" 502 "$(hook enviar-notificacion "$N8N_WEBHOOK_SECRET" "$TG")"
curl -s -X POST "$MOCK/__mock/fail" -d '{"email":false,"telegram":false}' -o /dev/null

echo "== c) alerta-interna"
curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
check "sin secreto -> 401" 401 "$(code "$N8N/alerta-interna" -H 'content-type: application/json' -d '{"texto":"x"}')"
check "con secreto -> 200" 200 "$(hook alerta-interna "$N8N_WEBHOOK_SECRET" '{"texto":"[SIGEC] 2 mensajes nuevos en la DLQ ms6.saga.comandos.dlq"}')"
check "llega al chat de administradores (-1001)" "-1001|[SIGEC] 2 mensajes nuevos en la DLQ ms6.saga.comandos.dlq" "$(mocklog | python3 -c "import sys,json;e=[x for x in json.load(sys.stdin) if x['kind']=='telegram'][0];print(e['chat_id']+'|'+e['text'])")"

echo "== b) recordatorio-cita (disparo manual; el programado va cada hora)"
curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
curl -s -X POST "$MOCK/__mock/citas" -d '[{"citaId":"11111111-1111-4111-8111-111111111111","pacienteId":"p1","fechaHora":"2026-12-01T10:00:00Z"},{"citaId":"22222222-2222-4222-8222-222222222222","pacienteId":"p2","fechaHora":"2026-12-01T11:00:00Z"}]' -o /dev/null
check "sin secreto -> 401" 401 "$(code "$N8N/recordatorio-ejecutar" -H 'content-type: application/json' -d '{}')"
check "con secreto -> 202" 202 "$(hook recordatorio-ejecutar "$N8N_WEBHOOK_SECRET" '{}')"
wait_count "e['kind']=='ms8-recordatorio'" 2 20
check "pide a MS8 las citas y dispara el envio de cada una (con el secreto interno correcto)" "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222" \
  "$(mocklog | python3 -c "import sys,json;print(','.join(e['citaId'] for e in json.load(sys.stdin) if e['kind']=='ms8-recordatorio'))")"
curl -s -X POST "$MOCK/__mock/citas" -d '[]' -o /dev/null; curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
hook recordatorio-ejecutar "$N8N_WEBHOOK_SECRET" '{}' >/dev/null; sleep 4
check "sin citas pendientes no envia nada" 0 "$(count "e['kind']=='ms8-recordatorio'")"

echo "== d) telegram-vinculacion (sondeo del bot cada 5 s)"
UPD=$(date +%s)   # el offset del bot se conserva en n8n entre ejecuciones: los update_id deben crecer siempre
curl -s -X DELETE "$MOCK/__mock/log" -o /dev/null
curl -s -X POST "$MOCK/__mock/updates" -d '[{"update_id":'$((UPD + 1))',"message":{"chat":{"id":777},"text":"/start VALID123"}},{"update_id":'$((UPD + 2))',"message":{"chat":{"id":888},"text":"/start MALO0000"}},{"update_id":'$((UPD + 3))',"message":{"chat":{"id":999},"text":"hola"}}]' -o /dev/null
wait_count "e['kind']=='telegram'" 2 25
check "vincula el codigo valido con el chat 777 y avisa" "VALID123@777" "$(mocklog | python3 -c "import sys,json;print(','.join(e['codigo']+'@'+e['chatId'] for e in json.load(sys.stdin) if e['kind']=='ms8-vincular' and e['codigo']=='VALID123'))")"
check "responde 'vinculada' al chat 777" ok "$(mocklog | python3 -c "import sys,json;print('ok' if any(e['kind']=='telegram' and e['chat_id']=='777' and 'vinculada' in e['text'] for e in json.load(sys.stdin)) else 'no')")"
check "codigo invalido: MS8 responde 404 y se avisa al chat 888" ok "$(mocklog | python3 -c "import sys,json;print('ok' if any(e['kind']=='telegram' and e['chat_id']=='888' and 'no es valido' in e['text'] for e in json.load(sys.stdin)) else 'no')")"
check "los mensajes que no son '/start <codigo>' se ignoran" 0 "$(count "e['kind']=='telegram' and e['chat_id']=='999'")"
sleep 12
check "no reprocesa los mismos mensajes (offset avanzado): 2 vinculaciones en total" 2 "$(count "e['kind']=='ms8-vincular'")"

printf '\n== Resultado: %d correctas, %d fallidas\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
