#!/usr/bin/env bash
# Extremo a extremo del Bloque L (MS7): token real de Keycloak -> gateway -> GraphQL, agente (proveedor SIMULADO, sin gastar API),
# RAG (pgvector + embeddings reales), reporte Excel valido (.xlsx con las columnas esperadas), CSV/PDF y consulta por voz (Whisper real con
# audio sintetizado por espeak-ng; se omite si faltan espeak-ng o el modelo).
# Requisitos: docker compose up -d (postgres, keycloak, dynamodb, rabbitmq), make dynamodb-init rabbitmq-declare, pnpm install,
#   venvs de services/ms7-inteligencia/{ml,embeddings,whisper}/.venv, modelos de `ml/` (si faltan se generan los SINTETICOS de humo).
# Arranca y detiene gateway, ms3, ms6, ms7, ms7-ml, ms7-embeddings y ms7-whisper (scripts/dev-services.sh). Duracion: ~2-4 min (la primera vez descarga modelos).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
DEV="$ROOT/scripts/dev-services.sh"
GW="${GATEWAY_URL:-http://localhost:8090}"
KC="http://localhost:8080/realms/sigec/protocol/openid-connect/token"
PGPORT="${POSTGRES_PORT:-${POSTGRES_HOST_PORT:-5432}}"
TMP="$(mktemp -d)"
fail=0; pass=0; omitidas=0
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
omitir() { printf '  OMITIDA %s\n' "$1"; omitidas=$((omitidas + 1)); }
section() { printf '\n== %s\n' "$1"; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
jq_() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }
gql() { curl -s -X POST "$GW/graphql" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"; }
post() { # TOKEN RUTA CUERPO [salida] -> codigo http
  curl -s -o "${4:-$TMP/out.json}" -w '%{http_code}' -X POST "$GW$2" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$3"
}
cleanup() { "$DEV" stop gateway ms3 ms6 ms7 ms7-ml ms7-embeddings ms7-whisper >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT

section "Preparacion"
node scripts/dynamodb-init.mjs >/dev/null && node scripts/rabbitmq-declare.mjs >/dev/null || { echo "FALLO preparando DynamoDB/RabbitMQ"; exit 1; }
PY=services/ms7-inteligencia/ml/.venv/bin/python
if [ ! -f ml/no-show/models/no-show.joblib ]; then
  echo "  (no hay modelo de inasistencia: se genera el de humo SINTETICO, no tiene valor predictivo)"
  $PY ml/no-show/train.py --sintetico-solo-prueba-de-codigo --arboles 100 >/dev/null || { echo "FALLO generando el modelo de humo"; exit 1; }
fi
if [ ! -f ml/demanda/models/segmentos.json ]; then
  echo "  (no hay segmentacion de demanda: se genera con datos SINTETICOS)"
  $PY ml/demanda/segmentar.py --fuente sintetico >/dev/null || { echo "FALLO generando la segmentacion"; exit 1; }
fi
"$DEV" stop gateway ms3 ms6 ms7 ms7-ml ms7-embeddings ms7-whisper >/dev/null 2>&1; sleep 2
export LLM_PROVIDER=simulated NOTIF_SENDER=simulated MS7_DATABASE_URL="${MS7_DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PGPORT}/ms7_inteligencia}"
export DB_PORT="${DB_PORT:-$PGPORT}"
"$DEV" start gateway ms3 ms6 ms7-ml ms7-embeddings ms7 | sed 's/^/  /'
WHISPER_OK=0
if command -v espeak-ng >/dev/null && [ -x services/ms7-inteligencia/whisper/.venv/bin/uvicorn ]; then
  "$DEV" start ms7-whisper | sed 's/^/  /'; WHISPER_OK=1
fi

TA=$(token administrador); TR=$(token recepcion); TP=$(token paciente); TC=$(token caja)

section "Autenticacion y roles"
check "GraphQL sin token -> 401 (lo rechaza el gateway)" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/graphql" -H 'Content-Type: application/json' -d '{"query":"{ demandaEspecialidades { k } }"}')"
check "agente sin token -> 401" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/inteligencia/agente/consulta" -H 'Content-Type: application/json' -d '{"texto":"hola"}')"
check "paciente no accede al agente -> 403" 403 "$(post "$TP" /api/inteligencia/agente/consulta '{"texto":"resumen de citas"}')"
check "paciente no accede a GraphQL" ok "$(gql "$TP" '{"query":"{ citas { items { citaId } } }"}' | jq_ "'ok' if d.get('data') is None and d.get('errors') else 'datos-expuestos'")"
check "introspeccion de GraphQL: permitida solo fuera de produccion (NODE_ENV)" ok "$(gql "$TA" '{"query":"{ __schema { queryType { name } } }"}' | jq_ "'ok' if 'data' in d else 'x'")"

section "GraphQL (por el gateway, con token real)"
R=$(gql "$TA" '{"query":"{ demandaEspecialidades { k sintetico especialidades { especialidad etiqueta citasPorSemana } } }"}')
check "demanda por especialidad (K-means)" ok "$(echo "$R" | jq_ "'ok' if d['data']['demandaEspecialidades']['k']>=2 and len(d['data']['demandaEspecialidades']['especialidades'])>0 else 'x'")"
HOY=$(date +%F); ANTES=$(date -d '-90 days' +%F); DESPUES=$(date -d '+60 days' +%F)
R=$(gql "$TA" "{\"query\":\"{ resumenCitas(desde: \\\"$ANTES\\\", hasta: \\\"$DESPUES\\\") { total truncado grupos { clave total } } }\"}")
check "resumen de citas (lee MS3)" ok "$(echo "$R" | jq_ "'ok' if d['data']['resumenCitas']['total']>=0 else 'x'")"
R=$(gql "$TC" "{\"query\":\"{ ingresos(desde: \\\"$ANTES\\\", hasta: \\\"$HOY\\\") { periodo confirmado } }\"}")
check "ingresos (lee MS6; rol caja)" ok "$(echo "$R" | jq_ "'ok' if isinstance(d['data']['ingresos'], list) else 'x'")"
R=$(gql "$TR" "{\"query\":\"{ ingresos(desde: \\\"$ANTES\\\", hasta: \\\"$HOY\\\") { periodo } }\"}")
check "recepcion no puede consultar ingresos" ok "$(echo "$R" | jq_ "'ok' if d.get('data') is None and d.get('errors') else 'x'")"
R=$(gql "$TA" '{"query":"{ resumenCitas(desde: \"ayer\", hasta: \"hoy\") { total } }"}')
check "argumentos invalidos -> error de validacion" ok "$(echo "$R" | jq_ "'ok' if d.get('errors') else 'x'")"

section "RAG (pgvector + embeddings reales)"
check "reindexar requiere administrador (recepcion -> 403)" 403 "$(post "$TR" /api/inteligencia/rag/reindexar '{}')"
check "reindexar documentos (administrador)" 201 "$(post "$TA" /api/inteligencia/rag/reindexar '{"forzar":true}')"
check "se indexaron 5 documentos" 5 "$(curl -s "$GW/api/inteligencia/rag/estado" -H "Authorization: Bearer $TA" | jq_ "d['documentos']")"
code=$(post "$TA" /api/inteligencia/agente/consulta '{"texto":"cual es la politica de cancelacion de citas"}')
check "agente: consulta de politicas" 201 "$code"
check "usa consultar_politicas y cita la fuente" ok "$(jq_ "'ok' if any(h['nombre']=='consultar_politicas' and h['ok'] for h in d['herramientasUsadas']) and 'Politica de cancelaci' in d['respuesta'].replace('Política','Politica') and 'seccion' in d['respuesta'].lower().replace('sección','seccion') else d['respuesta'][:200]" < "$TMP/out.json")"
post "$TA" /api/inteligencia/agente/consulta '{"texto":"cual es la politica sobre el cultivo de papas en marte"}' >/dev/null
check "pregunta fuera de alcance: no inventa (sin fragmentos)" ok "$(jq_ "'ok' if 'No hay informacion suficiente' in d['respuesta'] or not any(h['nombre']=='consultar_politicas' for h in d['herramientasUsadas']) else d['respuesta'][:160]" < "$TMP/out.json")"

section "Agente de texto (proveedor simulado)"
code=$(post "$TA" /api/inteligencia/agente/consulta '{"texto":"dame el resumen de citas por especialidad"}')
check "consulta de resumen -> 201" 201 "$code"
check "uso obtener_resumen_citas" ok "$(jq_ "'ok' if d['herramientasUsadas'][0]['nombre']=='obtener_resumen_citas' and d['herramientasUsadas'][0]['ok'] else 'x'" < "$TMP/out.json")"
post "$TR" /api/inteligencia/agente/consulta '{"texto":"cuales son los ingresos"}' >/dev/null
check "recepcion: consultar_ingresos rechazada por lista blanca" ok "$(jq_ "'ok' if d['herramientasUsadas'][0]['nombre']=='consultar_ingresos' and not d['herramientasUsadas'][0]['ok'] else 'x'" < "$TMP/out.json")"
check "texto demasiado corto -> 400" 400 "$(post "$TA" /api/inteligencia/agente/consulta '{"texto":"x"}')"
check "auditoria visible solo al administrador (recepcion 403)" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/inteligencia/agente/auditoria" -H "Authorization: Bearer $TR")"
check "la auditoria registro las llamadas (incluida la rechazada)" ok "$(curl -s "$GW/api/inteligencia/agente/auditoria?limite=50" -H "Authorization: Bearer $TA" | jq_ "'ok' if any(r['estado']=='rechazada' for r in d['registros']) and any(r['estado']=='ok' for r in d['registros']) else 'x'")"

section "Reportes: Excel, CSV y PDF"
ESPEC="{\"titulo\":\"Citas por especialidad\",\"fuente\":\"resumen_citas\",\"parametros\":{\"desde\":\"$ANTES\",\"hasta\":\"$DESPUES\"},\"columnas\":[\"clave\",\"total\",\"confirmadas\",\"canceladas\"],\"orden\":{\"columna\":\"total\",\"direccion\":\"desc\"},\"grafico\":{\"tipo\":\"barras\",\"x\":\"clave\",\"y\":\"total\"}}"
check "reporte Excel -> 201" 201 "$(post "$TA" '/api/inteligencia/reportes?formato=xlsx' "$ESPEC" "$TMP/reporte.xlsx")"
python3 - "$TMP/reporte.xlsx" > "$TMP/xlsx.txt" 2>&1 <<'PY'
import sys, zipfile, re
from xml.etree import ElementTree as ET
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
try:
    z = zipfile.ZipFile(sys.argv[1])
    assert z.testzip() is None, "zip corrupto"
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    hojas = [s.get("name") for s in wb.find("m:sheets", ns)]
    textos = [("".join(t.itertext())) for t in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    hoja1 = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    cabecera = [textos[int(c.find("m:v", ns).text)] for c in hoja1.find("m:sheetData", ns)[0] if c.get("t") == "s"]
    print("hojas=" + ",".join(hojas)); print("cabecera=" + ",".join(cabecera))
except Exception as e:
    print("ERROR", e)
PY
check "el .xlsx es un libro valido con hojas Datos y Resumen" "hojas=Datos,Resumen" "$(grep '^hojas=' "$TMP/xlsx.txt" || cat "$TMP/xlsx.txt")"
check "la hoja de datos tiene las columnas esperadas" "cabecera=Grupo,Citas,Confirmadas,Canceladas" "$(grep '^cabecera=' "$TMP/xlsx.txt" || echo sin-cabecera)"
check "reporte CSV" 201 "$(post "$TA" '/api/inteligencia/reportes?formato=csv' "$ESPEC" "$TMP/r.csv")"
check "CSV con cabecera esperada" "Grupo,Citas,Confirmadas,Canceladas" "$(sed 's/^\xEF\xBB\xBF//' "$TMP/r.csv" | head -1 | tr -d '\r')"
check "reporte PDF" 201 "$(post "$TA" '/api/inteligencia/reportes?formato=pdf' "$ESPEC" "$TMP/r.pdf")"
check "PDF valido (%PDF-)" "%PDF-" "$(head -c 5 "$TMP/r.pdf")"
check "especificacion con SQL/columna inventada -> 400" 400 "$(post "$TA" /api/inteligencia/reportes "{\"titulo\":\"x1x\",\"fuente\":\"resumen_citas\",\"columnas\":[\"clave\"],\"sql\":\"DROP TABLE citas\"}")"
check "reporte de ingresos prohibido a recepcion -> 403" 403 "$(post "$TR" /api/inteligencia/reportes '{"titulo":"Ingresos","fuente":"ingresos","columnas":["periodo"]}')"
code=$(post "$TA" /api/inteligencia/agente/consulta '{"texto":"genera un reporte de demanda por especialidad en excel"}')
check "el agente genera un reporte (generar_reporte)" ok "$(jq_ "'ok' if d['reporte'] and len(d['reporte']['filas'])>0 and d['herramientasUsadas'][0]['nombre']=='generar_reporte' else 'x'" < "$TMP/out.json")"

section "Voz (Whisper real + audio sintetizado)"
if [ "$WHISPER_OK" = 1 ]; then
  espeak-ng -v es -s 130 -p 40 -w "$TMP/voz.wav" "dame el resumen de citas por especialidad" 2>/dev/null
  code=$(curl -s -o "$TMP/voz.json" -w '%{http_code}' -X POST "$GW/api/inteligencia/agente/voz" -H "Authorization: Bearer $TA" -F "audio=@$TMP/voz.wav;type=audio/wav")
  check "consulta por voz -> 201" 201 "$code"
  check "devuelve la transcripcion (con 'cita')" ok "$(jq_ "'ok' if 'cita' in d['transcripcion']['texto'].lower() else d['transcripcion']['texto']" < "$TMP/voz.json")"
  check "y la respuesta del agente (herramienta usada)" ok "$(jq_ "'ok' if d['herramientasUsadas'] and d['respuesta'] else 'x'" < "$TMP/voz.json")"
  check "tipo de archivo no soportado -> 415" 415 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/inteligencia/agente/voz" -H "Authorization: Bearer $TA" -F "audio=@$TMP/xlsx.txt;type=text/plain")"
  check "voz: paciente -> 403" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GW/api/inteligencia/agente/voz" -H "Authorization: Bearer $TP" -F "audio=@$TMP/voz.wav;type=audio/wav")"
else
  omitir "voz: faltan espeak-ng o el venv de whisper (services/ms7-inteligencia/whisper/.venv)"
fi

printf '\nResultado: %s correctas, %s fallidas, %s omitidas\n' "$pass" "$fail" "$omitidas"
[ "$fail" -eq 0 ]
