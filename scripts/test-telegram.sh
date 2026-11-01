#!/usr/bin/env bash
# Prueba el bot de Telegram REAL con el token del .env (no con simulados):
#   1. getMe: el token es valido y es un bot.
#   2. sendMessage al chat de alertas internas (TELEGRAM_ALERT_CHAT_ID), si esta configurado.
#   3. (opcional) si pasas un chat_id como argumento, le envia el mensaje de prueba.
# Los secretos se leen SOLO del .env; nunca se imprimen.
#   scripts/test-telegram.sh [chat_id]
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$ROOT/.env"; set +a
API="${TELEGRAM_API_URL:-https://api.telegram.org}"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "OMITIDA: TELEGRAM_BOT_TOKEN esta vacio en .env."
  echo "  1) En Telegram abre @BotFather -> /newbot y copia el token al .env (TELEGRAM_BOT_TOKEN)."
  echo "  2) Para las alertas internas: crea un grupo, anade el bot y pon su chat id en TELEGRAM_ALERT_CHAT_ID"
  echo "     (escribe algo en el grupo y consulta https://api.telegram.org/bot<TOKEN>/getUpdates)."
  exit 2
fi

fail=0
resp=$(curl -s -m 15 "$API/bot$TELEGRAM_BOT_TOKEN/getMe")
if echo "$resp" | python3 -c 'import sys,json;d=json.load(sys.stdin);sys.exit(0 if d.get("ok") else 1)' 2>/dev/null; then
  echo "  ok    getMe: bot @$(echo "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["username"])')"
else
  echo "  FALLO getMe: el token no es valido o no hay conexion ($(echo "$resp" | head -c 120))"; exit 1
fi

enviar() { # chat_id texto
  curl -s -m 15 -X POST "$API/bot$TELEGRAM_BOT_TOKEN/sendMessage" -H 'content-type: application/json' \
    -d "{\"chat_id\":\"$1\",\"text\":\"$2\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("ok" if d.get("ok") else d.get("description","error"))'
}
TEXTO="[SIGEC] Prueba de Telegram $(date '+%H:%M:%S')"
if [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  r=$(enviar "$TELEGRAM_ALERT_CHAT_ID" "$TEXTO (alertas internas)")
  [ "$r" = ok ] && echo "  ok    mensaje enviado al chat de alertas internas" || { echo "  FALLO chat de alertas: $r"; fail=1; }
else
  echo "  omitido: TELEGRAM_ALERT_CHAT_ID vacio (no se probo el chat de alertas)"
fi
if [ -n "${1:-}" ]; then
  r=$(enviar "$1" "$TEXTO")
  [ "$r" = ok ] && echo "  ok    mensaje enviado al chat $1" || { echo "  FALLO chat $1: $r (el usuario debe haber escrito antes al bot)"; fail=1; }
fi
[ "$fail" -eq 0 ] && echo "TODO OK" || exit 1
