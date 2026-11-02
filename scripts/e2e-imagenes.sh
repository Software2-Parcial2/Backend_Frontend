#!/usr/bin/env bash
# Extremo a extremo del Bloque K (MS5): subida de radiografia -> S3 -> RabbitMQ -> inferencia (modelo STUB no clinico) -> ANALIZADA.
# Cubre: 401 sin token, 400 firma invalida / sin Idempotency-Key, replay, 403 rol, paciente ve solo lo suyo, URL temporal que caduca,
# objeto no accesible sin firma. Requisitos: docker compose up -d, pnpm install, venv de services/ms5-imagenes/inference (.venv).
# Arranca y detiene gateway, ms2, ms5 y ms5-inference (scripts/dev-services.sh). Duracion: ~1-2 min.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
DEV="$ROOT/scripts/dev-services.sh"
GW="${GATEWAY_URL:-http://localhost:8090}"
KC="http://localhost:8080/realms/sigec/protocol/openid-connect/token"
TMP="$(mktemp -d)"
fail=0; pass=0
uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d 'password=Sigec123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
section() { printf '\n== %s\n' "$1"; }
jq_() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
cleanup() { "$DEV" stop gateway ms2 ms5 ms5-inference >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT

# subir TOKEN CLAVE|- PACIENTE ARCHIVO -> "codigo" (cuerpo en $TMP/out.json)
subir() {
  local args=(-s -o "$TMP/out.json" -w '%{http_code}' -X POST "$GW/api/imagenes" -F "pacienteId=$3" -F "estudio=torax-pa" -F "archivo=@$4")
  [ "$1" != "-" ] && args+=(-H "Authorization: Bearer $1")
  [ "$2" != "-" ] && args+=(-H "Idempotency-Key: $2")
  curl "${args[@]}"
}
get() { curl -s -o "$TMP/get.json" -w '%{http_code}' -H "Authorization: Bearer $1" "$GW$2"; }

section "Preparacion"
node scripts/dynamodb-init.mjs >/dev/null && node scripts/rabbitmq-declare.mjs >/dev/null && node scripts/s3-init.mjs >/dev/null || { echo "FALLO preparando DynamoDB/RabbitMQ/S3"; exit 1; }
scripts/seed/paciente-demo.sh >/dev/null || { echo "FALLO sembrando el paciente demo"; exit 1; }
"$DEV" stop gateway ms2 ms5 ms5-inference >/dev/null 2>&1; sleep 2
export IMAGENES_URL_SEGUNDOS=3 IMAGENES_MAX_BYTES=2097152 MS2_URL=http://localhost:8082 ALLOW_STUB=true
"$DEV" start gateway ms2 ms5 ms5-inference | sed 's/^/  /'

python3 - "$TMP" <<'PY'
import sys, zlib, struct
def png(path, w=64, h=64):
    raw = b"".join(b"\x00" + bytes(((x * 3 + y * 2) % 256) for x in range(w)) for y in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b""))
png(sys.argv[1] + "/rx.png")
open(sys.argv[1] + "/falso.png", "wb").write(b"MZ\x90\x00 esto es un ejecutable renombrado a .png")   # extension .png, firma que no es de imagen
open(sys.argv[1] + "/grande.png", "wb").write(open(sys.argv[1] + "/rx.png", "rb").read() + b"\0" * 3_000_000)   # firma valida, supera el maximo (2 MB)
PY

TM=$(token medico); TP=$(token paciente); TR=$(token recepcion); TA=$(token administrador)
PROPIO="a0000000-0000-4000-8000-000000000001"

section "Autenticacion y validacion"
check "sin token -> 401" 401 "$(subir - "$(uuid)" "$PROPIO" "$TMP/rx.png")"
check "recepcion no puede subir -> 403" 403 "$(subir "$TR" "$(uuid)" "$PROPIO" "$TMP/rx.png")"
check "paciente no puede subir -> 403" 403 "$(subir "$TP" "$(uuid)" "$PROPIO" "$TMP/rx.png")"
check "sin Idempotency-Key -> 400" 400 "$(subir "$TM" - "$PROPIO" "$TMP/rx.png")"
check "firma invalida (ejecutable renombrado .png) -> 400" 400 "$(subir "$TM" "$(uuid)" "$PROPIO" "$TMP/falso.png")"
check "archivo mayor al maximo -> 413 o 400" ok "$(c=$(subir "$TM" "$(uuid)" "$PROPIO" "$TMP/grande.png"); [ "$c" = 413 ] || [ "$c" = 400 ] && echo ok || echo "$c")"
check "paciente inexistente -> 404 o 422 o 400" ok "$(c=$(subir "$TM" "$(uuid)" "$(uuid)" "$TMP/rx.png"); case $c in 400|404|422) echo ok;; *) echo "$c";; esac)"

section "Subida, analisis y resultado"
K=$(uuid)
check "medico sube -> 201" 201 "$(subir "$TM" "$K" "$PROPIO" "$TMP/rx.png")"
ID=$(jq_ "d['id']" <"$TMP/out.json")
check "estado inicial SUBIDA o ANALIZANDO" ok "$(jq_ "'ok' if d['estado'] in ('SUBIDA','ANALIZANDO') else d['estado']" <"$TMP/out.json")"
check "la respuesta no expone bucket ni clave del objeto" ok "$(jq_ "'ok' if 'bucket' not in d and 'objectKey' not in d else 'expuesto'" <"$TMP/out.json")"
curl -s -D "$TMP/h" -o "$TMP/out2.json" -X POST "$GW/api/imagenes" -H "Authorization: Bearer $TM" -H "Idempotency-Key: $K" -F "pacienteId=$PROPIO" -F "estudio=torax-pa" -F "archivo=@$TMP/rx.png" >/dev/null
check "misma clave y mismo archivo: replay con el mismo id" "$ID|true" "$(jq_ "d['id']" <"$TMP/out2.json")|$(grep -i '^idempotent-replay' "$TMP/h" | tr -d '\r' | awk '{print $2}')"
check "misma clave con OTRO archivo -> 422" 422 "$(subir "$TM" "$K" "$PROPIO" "$TMP/falso.png")"
ESTADO=""
for _ in $(seq 1 40); do get "$TM" "/api/imagenes/$ID" >/dev/null; ESTADO=$(jq_ "d['estado']" <"$TMP/get.json"); [ "$ESTADO" = ANALIZADA ] || [ "$ESTADO" = FALLIDA ] && break; sleep 1; done
check "termina ANALIZADA" ANALIZADA "$ESTADO"
check "resultado del modelo STUB no clinico" "stub-no-clinico" "$(jq_ "d['resultado']['modelo']" <"$TMP/get.json")"
check "resultado con probabilidad en [0,1] y clase" ok "$(jq_ "'ok' if 0<=d['resultado']['probabilidad_neumonia']<=1 and d['resultado']['clase'] else 'no'" <"$TMP/get.json")"
check "incluye el aviso clinico" ok "$(jq_ "'ok' if 'no es un diagn' in d['aviso'].lower() or 'diagn' in d['aviso'].lower() else 'no'" <"$TMP/get.json")"
check "SHA-256 coincide con el archivo" "$(sha256sum "$TMP/rx.png" | cut -d' ' -f1)" "$(jq_ "d['hashSha256']" <"$TMP/get.json")"

section "Listado y rol paciente"
check "medico lista por paciente -> 200" 200 "$(get "$TM" "/api/imagenes?pacienteId=$PROPIO&limite=5")"
check "...y contiene la imagen" ok "$(python3 -c "import json;d=json.load(open('$TMP/get.json'));items=d if isinstance(d,list) else d.get('items',d.get('datos',[]));print('ok' if any(i['id']=='$ID' for i in items) else 'no')")"
check "paciente ve SU imagen -> 200" 200 "$(get "$TP" "/api/imagenes/$ID")"
OTRO=$(curl -s -X POST "$GW/api/pacientes" -H "Authorization: Bearer $TR" -H "Idempotency-Key: $(uuid)" -H 'Content-Type: application/json' \
  -d "{\"nombre\":\"Otro Paciente\",\"documento\":\"E2E-$(date +%s%N | cut -c8-19)\",\"fechaNacimiento\":\"1985-05-05\"}" | jq_ "d['id']")
subir "$TM" "$(uuid)" "$OTRO" "$TMP/rx.png" >/dev/null; IDO=$(jq_ "d['id']" <"$TMP/out.json")
c=$(get "$TP" "/api/imagenes/$IDO"); check "paciente pide la imagen de OTRO -> 403 o 404" ok "$([ "$c" = 403 ] || [ "$c" = 404 ] && echo ok || echo "$c")"
c=$(get "$TP" "/api/imagenes?pacienteId=$OTRO"); check "paciente lista las de OTRO -> 403 o 404" ok "$([ "$c" = 403 ] || [ "$c" = 404 ] && echo ok || echo "$c")"
check "administrador ve cualquiera -> 200" 200 "$(get "$TA" "/api/imagenes/$IDO")"

section "URL temporal"
check "pide URL temporal -> 200" 200 "$(get "$TP" "/api/imagenes/$ID/url")"
URL=$(jq_ "d['url']" <"$TMP/get.json")
check "descarga con la URL firmada -> 200" 200 "$(curl -s -o "$TMP/dl.bin" -w '%{http_code}' "$URL")"
check "...y es el mismo archivo" "$(sha256sum "$TMP/rx.png" | cut -d' ' -f1)" "$(sha256sum "$TMP/dl.bin" | cut -d' ' -f1)"
check "la misma ruta SIN firma no es publica (403)" 403 "$(curl -s -o /dev/null -w '%{http_code}' "${URL%%\?*}")"
sleep 5
check "la URL caduca (403 tras IMAGENES_URL_SEGUNDOS)" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$URL")"
check "el bucket no se lista sin credenciales" ok "$(c=$(curl -s -o /dev/null -w '%{http_code}' "${S3_ENDPOINT:-http://localhost:9000}/${S3_BUCKET_RADIOGRAFIAS:-radiografias}/"); [ "$c" = 403 ] && echo ok || echo "$c")"

printf '\n== Resultado: %d correctas, %d fallidas\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
