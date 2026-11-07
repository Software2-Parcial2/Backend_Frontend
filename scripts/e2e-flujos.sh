#!/usr/bin/env bash
# Prueba de extremo a extremo de los flujos entre servicios, TODO por el gateway y con tokens reales de Keycloak.
#   1. alta de paciente (MS2)            -> MS4 crea su historia clinica (evento paciente.creado)
#   2. reservar cita (SAGA)              -> CONFIRMADA + cobro PROVISIONAL (MS6) + aviso enviado (MS8)
#   3. cancelar                          -> CANCELADA_USUARIO + cobro ANULADO + horario libre + aviso de cancelacion
#   4. reprogramar                       -> nueva fecha + horario viejo libre + aviso de reprogramacion
#   5. asistencia -> consulta -> firmar  -> MS3 EN_SALA/ATENDIDA, MS4 consulta firmada y receta (If-Match, 409 con version vigente)
#   6. estudio de imagen -> validacion   -> MS5 (subida, resultado de IA simulado, validacion) y el estudio aparece en la historia (MS4)
#   7. pago en caja -> balance           -> MS6 pago, comprobante y balance del turno
#   8. agentes de monitoreo (MS7)        -> configuracion, ejecucion bajo demanda sobre MS3/MS6 y listado de alertas
#   9. identidad (ms1)                   -> usuario nuevo, roles, sesion visible, revocarla, eventos y /api/salud
#
# Requisitos: docker compose up -d (postgres, rabbitmq, dynamodb, keycloak, mongo), make dynamodb-init rabbitmq-declare mongo-init,
# migraciones de MS6, `make keycloak-aplicar` con MS1_CLIENT_SECRET en .env, pnpm install. El flujo 6 ademas necesita el S3 local
# (docker compose up -d s3 && make s3-init); sin el se OMITE (y se dice). No usa n8n ni ML: MS8 va en modo simulado.
# Arranca y detiene los servicios con scripts/dev-services.sh.   Duracion aproximada: 3-5 minutos.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
while IFS='=' read -r k v; do
  [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  [ -z "${!k+x}" ] && export "$k=$v"
done <.env
DEV="$ROOT/scripts/dev-services.sh"
GW="${GATEWAY_URL:-http://localhost:8090}"
KCB="${KEYCLOAK_URL:-http://localhost:8080}"
KC="$KCB/realms/sigec/protocol/openid-connect/token"
MGMT="http://localhost:15672/api"
RABBIT="${RABBITMQ_USER:-sigec}:${RABBITMQ_PASSWORD:-}"
fail=0
pass=0
omitidos=0

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
token() { curl -s -X POST "$KC" -d grant_type=password -d client_id=sigec-shell -d "username=$1" -d "password=${2:-Sigec123!}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))'; }
check() { if [ "$2" = "$3" ]; then printf '  ok    %s\n' "$1"; pass=$((pass + 1)); else printf '  FALLO %s (esperado: %s, obtenido: %s)\n' "$1" "$2" "$3"; fail=$((fail + 1)); fi; }
section() { printf '\n== %s\n' "$1"; }
omitir() { printf '  OMITIDO %s\n' "$1"; omitidos=$((omitidos + 1)); }
jf() { python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: d={}
v=d
for k in '$1'.split('.'):
    v=v.get(k) if isinstance(v,dict) else (v[int(k)] if isinstance(v,list) and k.isdigit() and int(k)<len(v) else None)
print('' if v is None else v)"; }

# api METODO RUTA TOKEN [CUERPO] [cabeceras...]  ->  deja el cuerpo en $BODY y el codigo en $CODE
BODY=""; CODE=""
api() {
  local metodo="$1" ruta="$2" tk="${3:-}" cuerpo="${4:-}"
  if [ "$#" -ge 4 ]; then shift 4; else shift "$#"; fi
  local args=(-s -o /tmp/e2ef.body -w '%{http_code}' -X "$metodo" "$GW$ruta")
  [ -n "$tk" ] && args+=(-H "Authorization: Bearer $tk")
  case "$metodo" in POST|PUT|PATCH) args+=(-H "Idempotency-Key: $(uuid)");; esac
  [ -n "$cuerpo" ] && args+=(-H 'Content-Type: application/json' -d "$cuerpo")
  for h in "$@"; do args+=(-H "$h"); done
  CODE=$(curl "${args[@]}"); BODY=$(cat /tmp/e2ef.body)
}
body_f() { echo "$BODY" | jf "$1"; }
esperar() { # descripcion-comando valor-esperado timeout-s : repite hasta que el comando imprima el valor
  local t=0; while [ "$t" -lt "$3" ]; do [ "$(eval "$1")" = "$2" ] && return 0; sleep 1; t=$((t + 1)); done; return 1
}
fecha() { date -u -d "+40 days +$1 minutes" '+%Y-%m-%dT%H:%M:00.000Z'; }
horario() { node scripts/saga-inspect.mjs horario "$1" "$2" 2>/dev/null; }
db6() { docker compose exec -T postgres psql -U sigec -d ms6_facturacion -tAc "$1"; }
db4() { docker compose exec -T postgres psql -U sigec -d ms4_historias -tAc "$1"; }
cita_campo() { curl -s "$GW/api/citas/$1" -H "Authorization: Bearer $TR" | jf "$2"; }
admin_kc() { # token del administrador del reino master
  curl -s -X POST "$KCB/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli -d "username=${KEYCLOAK_ADMIN:-admin}" -d "password=${KEYCLOAK_ADMIN_PASSWORD:-}" | jf access_token
}
# Deja una contrasena definitiva a un usuario (lo que haria el al entrar por primera vez) para poder iniciar sesion en la prueba.
fijar_password() { # usuarioId password
  local mt; mt=$(admin_kc)
  curl -s -o /dev/null -X PUT "$KCB/admin/realms/sigec/users/$1/reset-password" -H "Authorization: Bearer $mt" -H 'Content-Type: application/json' -d "{\"type\":\"password\",\"value\":\"$2\",\"temporary\":false}"
  curl -s "$KCB/admin/realms/sigec/users/$1" -H "Authorization: Bearer $mt" | python3 -c "import sys,json;d=json.load(sys.stdin);d['requiredActions']=[];print(json.dumps(d))" >/tmp/e2ef.user
  curl -s -o /dev/null -X PUT "$KCB/admin/realms/sigec/users/$1" -H "Authorization: Bearer $mt" -H 'Content-Type: application/json' -d @/tmp/e2ef.user
}
borrar_usuario() { local mt; mt=$(admin_kc); curl -s -o /dev/null -X DELETE "$KCB/admin/realms/sigec/users/$1" -H "Authorization: Bearer $mt"; }

USUARIOS_TEMP=()
cleanup() {
  for u in "${USUARIOS_TEMP[@]:-}"; do [ -n "$u" ] && borrar_usuario "$u"; done
  "$DEV" stop gateway ms1 ms2 ms3 ms4 ms5 ms6 ms7 ms8 >/dev/null 2>&1
  "$DEV" workers-stop >/dev/null 2>&1
  "$DEV" poller-stop >/dev/null 2>&1
}
trap cleanup EXIT

section "Preparacion"
[ -n "${MS1_CLIENT_SECRET:-}" ] && [ "$MS1_CLIENT_SECRET" != "cambia_esto" ] || { echo "  Falta MS1_CLIENT_SECRET en .env (y make keycloak-aplicar). Ver docs/PENDIENTES.md (Fase 8)."; exit 2; }
cleanup
export NOTIF_SENDER=simulated NOTIF_MAX_INTENTOS=3 NOTIF_BACKOFF_BASE_MS=500 AVISO_ALERTAS=off LLM_PROVIDER=simulated
S3_OK=no; curl -s -m 2 -o /dev/null "${S3_ENDPOINT:-http://localhost:8333}" && S3_OK=si
SERVS=(gateway ms1 ms2 ms3 ms4 ms6 ms7 ms8)
[ "$S3_OK" = si ] && SERVS+=(ms5)
"$DEV" start "${SERVS[@]}" | sed 's/^/  /'
"$DEV" poller-start | sed 's/^/  /'
"$DEV" workers-start | sed 's/^/  /'
sleep 3
TA=$(token administrador); TR=$(token recepcion); TC=$(token caja); TP=$(token paciente)
[ -n "$TA" ] && [ -n "$TR" ] || { echo "  No se pudo obtener token de Keycloak"; exit 2; }
echo "  servicios: $("$DEV" status | awk '$3==200{print $1}' | tr '\n' ' ')"

# Medico de prueba creado por ms1 (con medicoId): lo usan los flujos 5 y 6. Se borra al terminar.
MEDICO_ID=$(uuid); SUFIJO=$(uuid | cut -c1-8)
api POST /api/identidad/usuarios "$TA" "{\"username\":\"e2e.medico.$SUFIJO\",\"email\":\"e2e.$SUFIJO@sigec.test\",\"nombre\":\"E2E\",\"apellido\":\"Medico\",\"roles\":[\"medico\"],\"medicoId\":\"$MEDICO_ID\",\"especialidad\":\"general\",\"matricula\":\"E2E-$SUFIJO\",\"passwordTemporal\":\"Temporal12345\"}"
check "ms1 crea el medico de prueba (201, con su medicoId)" "201|$MEDICO_ID" "$CODE|$(body_f medicoId)"
MED_UID=$(body_f id); USUARIOS_TEMP+=("$MED_UID")
fijar_password "$MED_UID" 'Definitiva12345!'
TM=$(token "e2e.medico.$SUFIJO" 'Definitiva12345!')
check "el medico inicia sesion y su token trae medico_id" "$MEDICO_ID" "$(echo "$TM" | python3 -c "import sys,base64,json;t=sys.stdin.read().strip().split('.');print(json.loads(base64.urlsafe_b64decode(t[1]+'==')).get('medico_id','') if len(t)==3 else '')")"

# ---------------------------------------------------------------------------------------------------
section "1. Alta de paciente -> historia clinica en MS4"
DOC="E2E-$(uuid | cut -c1-10)"
api POST /api/pacientes "$TR" "{\"nombre\":\"Carla Rojas E2E\",\"documento\":\"$DOC\",\"fechaNacimiento\":\"1990-05-01\",\"email\":\"carla.$SUFIJO@sigec.test\"}"
check "POST /api/pacientes -> 201" 201 "$CODE"
PAC=$(body_f id); HC=$(body_f numeroHistoria)
check "el paciente tiene numero de historia" ok "$([ -n "$HC" ] && echo ok || echo no)"
check "MS4 crea la historia (evento paciente.creado)" ok "$(esperar "curl -s -o /dev/null -w '%{http_code}' $GW/api/historias/paciente/$PAC -H 'Authorization: Bearer $TM'" 200 30 && echo ok || echo no)"
api GET "/api/historias/paciente/$PAC" "$TM"
HID=$(body_f id)
check "...con el mismo numero de historia y nombre" "$HC|Carla Rojas E2E" "$(body_f numeroHistoria)|$(body_f pacienteNombre)"
api GET "/api/historias/paciente/$PAC" "$TR"
check "recepcion NO accede a la historia (403)" 403 "$CODE"
api GET "/api/pacientes?q=Rohas&tipo=nombre" "$TR"
check "busqueda fonetica en MS2 ('Rohas' encuentra a Rojas)" ok "$(echo "$BODY" | python3 -c "import sys,json;print('ok' if any(p['id']=='$PAC' for p in json.load(sys.stdin)['items']) else 'no')")"

# ---------------------------------------------------------------------------------------------------
section "2. Reservar cita: SAGA -> CONFIRMADA, cobro PROVISIONAL y aviso"
H1=$(fecha 5)
api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$MEDICO_ID\",\"especialidad\":\"general\",\"fechaHora\":\"$H1\"}"
check "POST /api/citas -> 202" 202 "$CODE"
C1=$(body_f citaId)
check "cita CONFIRMADA" ok "$(esperar "echo \$(curl -s $GW/api/citas/$C1 -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\")" CONFIRMADA 40 && echo ok || echo no)"
check "factura PROVISIONAL en MS6" PROVISIONAL "$(db6 "select string_agg(estado, ',') from facturas where cita_id='$C1'")"
check "aviso de confirmacion ENVIADO (MS8)" ok "$(esperar "curl -s '$GW/api/notificaciones?citaId=$C1' -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;d=json.load(sys.stdin)['items'];print(d[0]['estado'] if d else '')\"" ENVIADA 30 && echo ok || echo no)"
check "el horario queda CONFIRMADO" CONFIRMADO "$(horario "$MEDICO_ID" "$H1")"
api GET "/api/citas/$C1/historial" "$TR"
check "GET historial muestra los pasos de la SAGA" ok "$(echo "$BODY" | grep -q COBRO && echo ok || echo no)"
api GET "/api/facturacion/facturas?citaId=$C1" "$TC"
check "caja lista la factura con numero de cargo (CG-...)" ok "$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin)['items'];print('ok' if d and str(d[0].get('numeroCargo','')).startswith('CG-') else 'no')")"
FAC1=$(body_f items.0.id)

# ---------------------------------------------------------------------------------------------------
section "3. Cancelar: cobro anulado, horario libre y aviso"
M3=$(uuid); H3=$(fecha 15)
api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$M3\",\"especialidad\":\"general\",\"fechaHora\":\"$H3\"}"; C3=$(body_f citaId)
esperar "curl -s $GW/api/citas/$C3 -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\"" CONFIRMADA 40
api POST "/api/citas/$C3/cancelar" "$TR" '{"motivo":"Pedido del paciente (prueba E2E)"}'
check "POST cancelar -> 200" 200 "$CODE"
check "cita CANCELADA_USUARIO" ok "$(esperar "curl -s $GW/api/citas/$C3 -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\"" CANCELADA_USUARIO 40 && echo ok || echo no)"
check "el cobro queda ANULADA" ok "$(esperar "docker compose exec -T postgres psql -U sigec -d ms6_facturacion -tAc \"select string_agg(estado, ',') from facturas where cita_id='$C3'\"" ANULADA 40 && echo ok || echo no)"
check "el horario esta LIBRE" ok "$(esperar "node scripts/saga-inspect.mjs horario $M3 $H3" LIBRE 30 && echo ok || echo no)"
check "aviso de cancelacion enviado al paciente" ok "$(esperar "curl -s '$GW/api/notificaciones?citaId=$C3' -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(','.join(sorted(n['tipo'] for n in json.load(sys.stdin)['items'])))\" | grep -c CITA_CANCELADA" 1 30 && echo ok || echo no)"
api POST "/api/citas/$C3/cancelar" "$TR" '{"motivo":"otra vez"}'
check "cancelar de nuevo -> 409 CITA_YA_CANCELADA" "409|CITA_YA_CANCELADA" "$CODE|$(body_f code)"
api POST "/api/citas/$C3/cancelar" "$TP" '{"motivo":"x"}'
check "un paciente no cancela citas ajenas (404 o 403)" ok "$([ "$CODE" = 404 ] || [ "$CODE" = 403 ] && echo ok || echo "$CODE")"

# ---------------------------------------------------------------------------------------------------
section "4. Reprogramar: nueva fecha, horario viejo libre, aviso"
M4=$(uuid); H4=$(fecha 25); H4B=$(fecha 26)
api POST /api/citas "$TR" "{\"pacienteId\":\"$PAC\",\"medicoId\":\"$M4\",\"especialidad\":\"general\",\"fechaHora\":\"$H4\"}"; C4=$(body_f citaId)
esperar "curl -s $GW/api/citas/$C4 -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\"" CONFIRMADA 40
api POST "/api/citas/$C4/reprogramar" "$TR" "{\"fechaHora\":\"$H4B\"}"
check "POST reprogramar -> 200" 200 "$CODE"
check "la cita sigue CONFIRMADA con la nueva fecha" "CONFIRMADA|$H4B" "$(cita_campo "$C4" estado)|$(cita_campo "$C4" fechaHora)"
check "horario nuevo CONFIRMADO y viejo LIBRE" "CONFIRMADO|LIBRE" "$(horario "$M4" "$H4B")|$(horario "$M4" "$H4")"
check "el cargo se conserva (misma factura, sin duplicar)" 1 "$(db6 "select count(*) from facturas where cita_id='$C4' and estado <> 'ANULADA'")"
check "aviso de reprogramacion enviado" ok "$(esperar "curl -s '$GW/api/notificaciones?citaId=$C4' -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(sum(1 for n in json.load(sys.stdin)['items'] if n['tipo']=='CITA_REPROGRAMADA' and n['estado']=='ENVIADA'))\"" 1 30 && echo ok || echo no)"
M4X=$(uuid); HX=$(fecha 27)
api POST /api/citas "$TR" "{\"pacienteId\":\"$(uuid)\",\"medicoId\":\"$M4X\",\"especialidad\":\"general\",\"fechaHora\":\"$HX\"}"; CX=$(body_f citaId)
esperar "curl -s $GW/api/citas/$CX -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\"" CONFIRMADA 40
api POST "/api/citas/$CX/reprogramar" "$TR" "{\"fechaHora\":\"$H4B\"}"
check "reprogramar a un horario ocupado por otro medico NO bloquea (distinto medico)" 200 "$CODE"
api POST "/api/citas/$C4/reprogramar" "$TR" "{\"fechaHora\":\"$H4B\"}"
check "reprogramar al mismo horario -> 422/409 (MISMO_HORARIO)" ok "$([ "$(body_f code)" = MISMO_HORARIO ] && echo ok || echo "$CODE $(body_f code)")"

# ---------------------------------------------------------------------------------------------------
section "5. Asistencia -> consulta -> firma (If-Match) -> receta"
api POST "/api/citas/$C1/asistencia" "$TR" '{"accion":"LLEGO"}'
check "registrar llegada -> 200, cita EN_SALA" "200|EN_SALA" "$CODE|$(cita_campo "$C1" estado)"
check "MS4 conoce la cita (proyeccion de cita.confirmada/asistencia)" ok "$(esperar "docker compose exec -T postgres psql -U sigec -d ms4_historias -tAc \"select estado from citas_proyeccion where cita_id='$C1'\"" LLEGO 30 && echo ok || echo no)"
api POST "/api/historias/$HID/consultas" "$TM" "{\"citaId\":\"$C1\",\"motivo\":\"Control general\",\"signosVitales\":{\"pa\":\"120/80\"}}"
check "iniciar la consulta de la cita -> 201 (BORRADOR)" "201|BORRADOR" "$CODE|$(body_f estado)"
CONS=$(body_f id)
api POST "/api/historias/$HID/consultas" "$TM" "{\"citaId\":\"$C1\",\"motivo\":\"otra\"}"
check "segunda consulta de la misma cita -> 409 CONSULTA_YA_EXISTE" "409|CONSULTA_YA_EXISTE" "$CODE|$(body_f code)"
api POST "/api/historias/$HID/consultas" "$TR" "{\"citaId\":\"$C1\",\"motivo\":\"x\"}"
check "recepcion no inicia consultas (403)" 403 "$CODE"
EDIT='{"motivo":"Control general","diagnostico":"Sano","tratamiento":"Ninguno","indicaciones":"Control en 6 meses","receta":[{"medicamento":"Vitamina C 500 mg","dosis":"1 tableta","frecuencia":"c/24h","duracion":"30 dias"}]}'
api PUT "/api/historias/consultas/$CONS" "$TM" "$EDIT" 'If-Match: "0"'
check "editar con la version correcta -> 200" 200 "$CODE"
api PUT "/api/historias/consultas/$CONS" "$TM" "$EDIT" 'If-Match: "0"'
check "editar con una version vieja -> 409 VERSION_CONFLICTO con la vigente" "409|VERSION_CONFLICTO|1" "$CODE|$(body_f code)|$(body_f versionVigente)"
api POST "/api/historias/consultas/$CONS/firmar" "$TM" ""
check "firmar -> 200 FIRMADA" "200|FIRMADA" "$CODE|$(body_f estado)"
api GET "/api/historias/consultas/$CONS/receta" "$TM"
check "receta de la consulta firmada" "Vitamina C 500 mg" "$(body_f items.0.medicamento)"
api PUT "/api/historias/consultas/$CONS" "$TM" "$EDIT" 'If-Match: "2"'
check "una consulta firmada ya no se edita (409 CONSULTA_FIRMADA)" "409|CONSULTA_FIRMADA" "$CODE|$(body_f code)"
api POST "/api/citas/$C1/asistencia" "$TR" '{"accion":"ATENDIDA"}'
check "marcar ATENDIDA -> 200" "200|ATENDIDA" "$CODE|$(cita_campo "$C1" estado)"
check "el evento consulta.firmada quedo en el outbox de MS4" 1 "$(db4 "select count(*) from outbox where event_type='consulta.firmada' and aggregate_id='$CONS'")"
TAD="$TA"; api GET "/api/historias/$HID/auditoria?limite=50" "$TAD"
check "el administrador ve la auditoria de accesos (sin contenido clinico)" ok "$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin)['items'];print('ok' if len(d)>=4 and not any('diagnostico' in json.dumps(x) for x in d) else 'no')")"
api GET "/api/historias/$HID/auditoria" "$TM"
check "el medico NO ve la auditoria (403)" 403 "$CODE"

# ---------------------------------------------------------------------------------------------------
section "6. Estudio de imagen -> analisis -> validacion medica -> aparece en la historia"
if [ "$S3_OK" != si ]; then
  omitir "sin S3 local (docker compose up -d s3 && make s3-init); no se prueba MS5"
else
  # PNG 1x1 distinto en cada corrida (el contenido cambia el SHA-256: no es un duplicado)
  python3 - "$SUFIJO" >/tmp/e2ef.png <<'EOF'
import sys, zlib, struct
def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
px = bytes([int(sys.argv[1][:2], 16), int(sys.argv[1][2:4], 16), 0])
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00' + px)) + chunk(b'IEND', b'')
sys.stdout.buffer.write(png)
EOF
  CODE=$(curl -s -o /tmp/e2ef.body -w '%{http_code}' -X POST "$GW/api/imagenes" -H "Authorization: Bearer $TM" -H "Idempotency-Key: $(uuid)" -F "archivo=@/tmp/e2ef.png;type=image/png" -F "pacienteId=$PAC" -F "estudio=radiografia-torax")
  BODY=$(cat /tmp/e2ef.body)
  check "subir el estudio -> 201 (origen MEDICO, validacion PENDIENTE)" "201|MEDICO|PENDIENTE" "$CODE|$(body_f origen)|$(body_f validacion)"
  IMG=$(body_f id)
  CODE=$(curl -s -o /tmp/e2ef.body -w '%{http_code}' -X POST "$GW/api/imagenes" -H "Authorization: Bearer $TM" -H "Idempotency-Key: $(uuid)" -F "archivo=@/tmp/e2ef.png;type=image/png" -F "pacienteId=$PAC"); BODY=$(cat /tmp/e2ef.body)
  check "la misma radiografia otra vez -> 409 IMAGEN_DUPLICADA" "409|IMAGEN_DUPLICADA" "$CODE|$(body_f code)"
  api POST "/api/imagenes/$IMG/validacion" "$TM" '{"decision":"CONFIRMA"}'
  check "validar antes del analisis -> 409 ANALISIS_PENDIENTE" "409|ANALISIS_PENDIENTE" "$CODE|$(body_f code)"
  # La inferencia (TensorFlow) no corre aqui: se publica su respuesta con el mismo contrato (imagenes.analisis.completado).
  ENV=$(python3 - "$IMG" <<'EOF'
import sys, json, uuid, datetime
img = sys.argv[1]
print(json.dumps({"id": str(uuid.uuid4()), "type": "imagenes.analisis.completado", "occurredAt": datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
  "correlationId": img, "causationId": None, "version": 1,
  "payload": {"imagenId": img, "probabilidad_neumonia": 0.12, "clase": "NORMAL", "version_modelo": "e2e", "modelo": "stub-no-clinico", "aviso": "apoyo a la decision clinica; no es un diagnostico"}}))
EOF
)
  PUB=$(python3 - "$ENV" <<'EOF'
import sys, json
print(json.dumps({"properties": {"content_type": "application/json", "delivery_mode": 2}, "routing_key": "imagenes.analisis.completado", "payload": sys.argv[1], "payload_encoding": "string"}))
EOF
)
  curl -s -u "$RABBIT" -X POST "$MGMT/exchanges/%2F/sigec.saga/publish" -H 'content-type: application/json' -d "$PUB" >/dev/null
  check "MS5 aplica el resultado (ANALIZADA)" ok "$(esperar "curl -s $GW/api/imagenes/$IMG -H 'Authorization: Bearer $TM' | python3 -c \"import sys,json;print(json.load(sys.stdin).get('estado',''))\"" ANALIZADA 30 && echo ok || echo no)"
  api GET "/api/imagenes?validacion=PENDIENTE&q=Carla" "$TM"
  check "la bandeja de validacion lista el estudio (busqueda por nombre del paciente)" ok "$(echo "$BODY" | python3 -c "import sys,json;print('ok' if any(i['id']=='$IMG' for i in json.load(sys.stdin)['items']) else 'no')")"
  api GET "/api/imagenes/$IMG" "$TP"
  check "el paciente no ve un estudio sin validar (404)" 404 "$CODE"
  api POST "/api/imagenes/$IMG/validacion" "$TM" '{"decision":"MODIFICA"}'
  check "modificar sin texto -> 422 INFORME_REQUERIDO" "422|INFORME_REQUERIDO" "$CODE|$(body_f code)"
  api POST "/api/imagenes/$IMG/validacion" "$TM" '{"decision":"MODIFICA","informe":"Sin hallazgos patologicos; campos pulmonares claros."}'
  check "validar (MODIFICA con informe) -> 200 VALIDADO con huella" "200|VALIDADO|64" "$CODE|$(body_f validacion)|$(body_f informe.huella | awk '{print length}')"
  api POST "/api/imagenes/$IMG/validacion" "$TM" '{"decision":"CONFIRMA"}'
  check "validar dos veces -> 409 YA_VALIDADO" "409|YA_VALIDADO" "$CODE|$(body_f code)"
  check "MS4 recibe imagen.informe-validado" ok "$(esperar "docker compose exec -T postgres psql -U sigec -d ms4_historias -tAc \"select count(*) from estudios_proyeccion where imagen_id='$IMG'\"" 1 30 && echo ok || echo no)"
  api GET "/api/historias/$HID/estudios" "$TM"
  check "el estudio aparece en la historia clinica" "$IMG|VALIDADO" "$(body_f 0.imagenId)|$(body_f 0.validacion)"
  api GET "/api/imagenes/$IMG" "$TP"
  check "ya validado, el paciente (con claim paciente_id) solo lo ve si es suyo" ok "$([ "$CODE" = 404 ] && echo ok || echo "$CODE")"
  check "MS8 avisa al paciente que su estudio tiene informe" ok "$(esperar "curl -s '$GW/api/notificaciones?pacienteId=$PAC&tipo=ESTUDIO_VALIDADO' -H 'Authorization: Bearer $TR' | python3 -c \"import sys,json;print(len(json.load(sys.stdin)['items']))\"" 1 30 && echo ok || echo no)"
fi

# ---------------------------------------------------------------------------------------------------
section "7. Pago en caja -> comprobante -> balance"
api POST "/api/facturacion/facturas/$FAC1/pagos" "$TC" '{"metodo":"EFECTIVO","recibido":"200.00"}'
check "registrar el pago -> 201 (o 200)" ok "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ok || echo "$CODE $(body_f code)")"
COMP=$(body_f pago.comprobante)
check "el pago trae numero de comprobante CI-..." ok "$([ "${COMP#CI-}" != "$COMP" ] && echo ok || echo "$BODY")"
api GET "/api/facturacion/facturas/$FAC1" "$TC"
check "la factura pasa a PAGADA" PAGADA "$(body_f estado)"
api POST "/api/facturacion/facturas/$FAC1/pagos" "$TC" '{"metodo":"EFECTIVO","recibido":"200.00"}'
check "pagar otra vez -> 409 FACTURA_YA_PAGADA" "409|FACTURA_YA_PAGADA" "$CODE|$(body_f code)"
api GET "/api/facturacion/facturas/$FAC1/comprobante" "$TC"
check "comprobante en JSON (no es factura fiscal)" 200 "$CODE"
api GET "/api/facturacion/balance" "$TC"
check "balance del turno responde con totales" ok "$([ "$CODE" = 200 ] && echo ok || echo "$CODE")"
api GET "/api/facturacion/facturas/$FAC1" "$TP"
check "un paciente ajeno no ve facturas de otros (403/404)" ok "$([ "$CODE" = 404 ] || [ "$CODE" = 403 ] && echo ok || echo "$CODE")"

# ---------------------------------------------------------------------------------------------------
section "8. Agentes de monitoreo (MS7) sobre MS3 y MS6 reales"
api GET /api/inteligencia/agentes "$TA"
check "hay 4 agentes configurados" 4 "$(echo "$BODY" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")"
api PUT /api/inteligencia/agentes/cancelaciones "$TA" '{"umbral":0.3,"intervaloMin":30}'
check "ajustar umbral e intervalo -> 200" "200|0.3|30" "$CODE|$(body_f umbral)|$(body_f intervaloMin)"
api PUT /api/inteligencia/agentes/cancelaciones "$TR" '{"umbral":0.4}'
check "recepcion no configura agentes (403)" 403 "$CODE"
api POST /api/inteligencia/agentes/cancelaciones/ejecutar "$TA" ""
check "ejecutar el agente de cancelaciones (usa /api/citas/resumen de MS3) -> 200" "200|cancelaciones" "$CODE|$(body_f agenteId)"
api POST /api/inteligencia/agentes/ingresos/ejecutar "$TA" ""
check "ejecutar el agente de ingresos (usa MS6) -> 200" "200|ingresos" "$CODE|$(body_f agenteId)"
api GET /api/inteligencia/agentes "$TA"
check "ambos quedan con ultimoEstado OK" "OK,OK" "$(echo "$BODY" | python3 -c "import sys,json;print(','.join(a['ultimoEstado'] or '' for a in json.load(sys.stdin)['items'] if a['id'] in ('cancelaciones','ingresos')))")"
api GET "/api/inteligencia/alertas?estado=ABIERTA&limite=5" "$TR"
check "listar alertas -> 200 con {items, siguiente}" "200|1" "$CODE|$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if 'items' in d and 'siguiente' in d else 0)")"
api POST /api/inteligencia/agentes/inventado/ejecutar "$TA" ""
check "agente inexistente -> 422 AGENTE_INVALIDO" "422|AGENTE_INVALIDO" "$CODE|$(body_f code)"
api PUT /api/inteligencia/agentes/cancelaciones "$TA" '{"umbral":0.25,"intervaloMin":60}'

# ---------------------------------------------------------------------------------------------------
section "9. Identidad (ms1): usuario, roles, sesion, revocar, eventos y salud"
U9="e2e.recep.$SUFIJO"
api POST /api/identidad/usuarios "$TA" "{\"username\":\"$U9\",\"email\":\"$U9@sigec.test\",\"nombre\":\"E2E\",\"apellido\":\"Recepcion\",\"roles\":[\"recepcion\"],\"passwordTemporal\":\"Temporal12345\"}"
check "crear usuario -> 201" "201|recepcion" "$CODE|$(body_f roles.0)"
UID9=$(body_f id); USUARIOS_TEMP+=("$UID9")
api POST /api/identidad/usuarios "$TA" "{\"username\":\"$U9\",\"email\":\"otro.$U9@sigec.test\",\"nombre\":\"E\",\"apellido\":\"R\",\"roles\":[\"caja\"]}"
check "usuario duplicado -> 409 USUARIO_DUPLICADO" "409|USUARIO_DUPLICADO" "$CODE|$(body_f code)"
api GET "/api/identidad/usuarios?q=$U9" "$TR"
check "recepcion NO administra usuarios (403)" 403 "$CODE"
api GET "/api/identidad/usuarios?q=$U9" "$TA"
check "el administrador lo encuentra" "$UID9" "$(body_f items.0.id)"
fijar_password "$UID9" 'Definitiva12345!'
T9=$(token "$U9" 'Definitiva12345!')
check "el usuario nuevo inicia sesion" ok "$([ -n "$T9" ] && echo ok || echo no)"
api GET /api/pacientes "$T9"
check "su token funciona en los servicios (rol recepcion lista pacientes)" 200 "$CODE"
api GET "/api/identidad/usuarios/$UID9/sesiones" "$TA"
check "su sesion es visible para el administrador" ok "$([ "$(echo "$BODY" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")" -ge 1 ] && echo ok || echo no)"
api PUT "/api/identidad/usuarios/$UID9/roles" "$TA" '{"roles":["caja"]}'
check "cambiar rol a caja (cierra sus sesiones)" "200|caja" "$CODE|$(body_f roles.0)"
api GET "/api/identidad/usuarios/$UID9/sesiones" "$TA"
check "...y ya no tiene sesiones abiertas" 0 "$(echo "$BODY" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")"
T9=$(token "$U9" 'Definitiva12345!')
api POST "/api/identidad/usuarios/$UID9/revocar-sesiones" "$TA" ""
check "revocar sesiones -> 204" 204 "$CODE"
api POST "/api/identidad/usuarios/$UID9/deshabilitar" "$TA" ""
check "deshabilitar -> activo=false" "200|False" "$CODE|$(body_f activo)"
check "el deshabilitado ya no inicia sesion" "" "$(token "$U9" 'Definitiva12345!')"
ADM_ID=$(curl -s "$GW/api/identidad/usuarios?q=administrador&rol=administrador" -H "Authorization: Bearer $TA" | jf items.0.id)
api POST "/api/identidad/usuarios/$ADM_ID/deshabilitar" "$TA" ""
check "el administrador no puede deshabilitarse a si mismo (409 AUTOPROTECCION)" "409|AUTOPROTECCION" "$CODE|$(body_f code)"
api GET "/api/identidad/eventos?tipo=LOGIN&limite=5" "$TA"
check "eventos de autenticacion de Keycloak" 200 "$CODE"
api GET /api/salud "$TA"
check "GET /api/salud por el gateway lista la pila" ok "$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);n={s['nombre']:s['estado'] for s in d['servicios']};print('ok' if n.get('gateway')=='OK' and n.get('keycloak')=='OK' and n.get('ms3-citas')=='OK' else d)")"
api GET /api/salud "$TR"
check "/api/salud es solo para el administrador (403)" 403 "$CODE"
api GET /api/pacientes
check "sin token -> 401 problem+json" "401" "$CODE"

# ---------------------------------------------------------------------------------------------------
section "Resumen"
printf '  %d ok, %d fallos, %d omitidos\n' "$pass" "$fail" "$omitidos"
[ "$fail" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
