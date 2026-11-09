# Lo que tienes que hacer tú (IA, n8n, Telegram y móvil)

Todo el código ya está hecho y probado **con piezas simuladas**. Lo que falta no es programar: son cosas que necesitan **tus cuentas, tu teléfono o tu máquina**
y que yo no puedo hacer por ti. Esta guía dice cuáles son, cuánto tardan y cómo comprobar que quedaron bien.

> **Regla de oro:** los secretos (tokens, claves) van **solo** en el archivo `.env` de la raíz del repo. Ese archivo no se sube a git.
> No los pegues en el chat, en commits ni en capturas.

Resumen rápido:

| # | Qué | Qué consigues | Tiempo | Necesitas |
|---|---|---|---|---|
| 1 | Correo real con Mailtrap | n8n envía correos de verdad (a un inbox de pruebas) | 5 min | cuenta gratis de Mailtrap |
| 2 | Bot de Telegram | avisos y vinculación por Telegram | 10 min | Telegram en el teléfono |
| 3 | LLM real (Gemini o Claude) | el asistente de reportes y las políticas con IA de verdad | 5 min | una API key |
| 4 | Modelos de ML reales | inasistencia y neumonía entrenados con datos reales (hoy son sintéticos) | 10 min + 30 min a horas de entrenamiento | cuenta de Kaggle |
| 5 | Micrófono (voz) | probar el dictado en el navegador | 2 min | micrófono |
| 6 | App móvil | probarla en emulador o teléfono | 1 h | Android Studio o un teléfono |

Cuando termines cada punto, avísame (“ya puse Mailtrap”, “ya puse Telegram”…) y yo hago las pruebas automáticas y arreglo lo que falle.

---

## 0. Antes de empezar: dejar la pila arriba

```bash
docker compose up -d                              # si el puerto 5432 está ocupado: POSTGRES_HOST_PORT=5440 docker compose up -d
make dynamodb-init rabbitmq-declare mongo-init keycloak-aplicar seed
make n8n-import                                   # importa y activa los 4 workflows de n8n
scripts/dev-services.sh start gateway ms1 ms2 ms3 ms4 ms5 ms6 ms7 ms8
scripts/dev-services.sh poller-start && scripts/dev-services.sh workers-start
```

Más detalle en `docs/frontends-conexion.md`. Cada vez que cambies algo del `.env` hay que **reiniciar el servicio que lo usa**
(n8n: `docker compose up -d n8n`; servicios Nest: `scripts/dev-services.sh stop <servicio>` y `start <servicio>`).

---

## 1. n8n + Mailtrap (correos)

n8n ya tiene el workflow `enviar-notificacion`. Solo le faltan las credenciales de Mailtrap.

1. Entra a <https://mailtrap.io> y crea una cuenta gratis.
2. Ve a **Email Testing → Inboxes** y abre (o crea) un inbox, por ejemplo “SIGEC”.
3. Anota tres datos:
   - **API token:** *Settings → API Tokens → Add Token* (con permiso sobre ese inbox/cuenta).
   - **Inbox ID:** el número que aparece en la URL del inbox (`.../inboxes/1234567/messages`).
   - **Account ID:** el número de la URL de la cuenta (`.../accounts/987654/...`) o en *Settings*.
4. Ponlos en `.env`:
   ```
   MAILTRAP_API_TOKEN=...
   MAILTRAP_INBOX_ID=...
   MAILTRAP_ACCOUNT_ID=...
   ```
5. Recrea n8n para que lea las variables: `docker compose up -d n8n`.

**Cómo comprobarlo tú:**
```bash
set -a; source .env; set +a
curl -s -X POST localhost:5678/webhook/enviar-notificacion \
  -H 'content-type: application/json' -H "x-sigec-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"canal":"EMAIL","destinatario":"paciente@example.test","plantilla":"prueba","datos":{"asunto":"Prueba SIGEC","texto":"Hola desde n8n","html":"<p>Hola desde n8n</p>"}}'
```
Debe responder `{"ok":true...}` y el correo aparece en tu inbox de Mailtrap. Si responde `"fallo del proveedor"`, el token o el inbox están mal.

> Mailtrap *sandbox* **captura** los correos en un inbox de pruebas; no los entrega a una dirección real. Para el proyecto basta y es lo esperado.

---

## 2. Telegram (bot)

Hacen falta dos cosas: el **bot** (para enviar y para vincular pacientes) y un **chat de alertas** (donde n8n avisa al personal).

### 2.1 Crear el bot
1. En Telegram busca **@BotFather** y escribe `/newbot`.
2. Elige un nombre (“SIGEC Clínica”) y un usuario que termine en `bot` (por ejemplo `sigec_clinica_bot`).
3. BotFather te da el **token** (`123456:ABC...`). Guárdalo.
4. En `.env`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_BOT_USERNAME=sigec_clinica_bot
   ```

### 2.2 Chat para las alertas internas
1. Crea un **grupo** en Telegram, agrega a tu bot y escribe cualquier mensaje en el grupo.
2. Obtén el id del chat (será un número, normalmente negativo):
   ```bash
   set -a; source .env; set +a
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | python3 -m json.tool | grep -n '"chat"' -A3
   ```
3. Ponlo en `.env`: `TELEGRAM_ALERT_CHAT_ID=-100123456789`
4. Si `getUpdates` sale vacío, escribe otro mensaje en el grupo y repite. Si dice que hay un *webhook* activo:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"` (n8n necesita sondear con `getUpdates`).
5. Recrea n8n: `docker compose up -d n8n`.

### 2.3 Probar el envío
```bash
curl -s -X POST localhost:5678/webhook/alerta-interna \
  -H 'content-type: application/json' -H "x-sigec-secret: $N8N_WEBHOOK_SECRET" \
  -d '{"texto":"Alerta de prueba de SIGEC"}'
```
Debe aparecer el mensaje en el grupo.

### 2.4 Probar la vinculación (esta parte solo la puedes hacer tú, con el teléfono)
1. Inicia sesión como paciente (`paciente` / `Sigec123!`) en la PWA (<http://localhost:5174>) → **Avisos** → **Generar código**.
2. Abre tu bot en Telegram y envíale: `/start EL_CODIGO` (el código dura 10 minutos).
3. En unos 5 segundos (n8n sondea) el bot responde “vinculado” y en la PWA la cuenta pasa a **vinculada**.
4. Activa el canal Telegram en las preferencias y reserva una cita: te llega el mensaje al teléfono.

---

## 3. IA: LLM real (Gemini o Claude)

Hoy las pruebas usan `LLM_PROVIDER=simulated` (respuestas por palabras clave). Con una clave real el asistente de reportes
(`/gestion#/asistente`) y la consulta de políticas (`/gestion#/politicas`) usan un modelo de verdad a través de MCP.

**Opción A – Gemini (gratis para empezar):**
1. <https://aistudio.google.com/apikey> → *Create API key*.
2. `.env`: `LLM_PROVIDER=gemini` y `GEMINI_API_KEY=...`

**Opción B – Claude:**
1. <https://console.anthropic.com> → *API Keys* (requiere saldo).
2. `.env`: `LLM_PROVIDER=claude` y `ANTHROPIC_API_KEY=...`

Reinicia MS7: `scripts/dev-services.sh stop ms7 && scripts/dev-services.sh start ms7`
(si queda un proceso viejo: `pgrep -f "services/ms7-inteligencia/ap[i]"` y `kill` esos pids).

**Cómo comprobarlo:** entra como `administrador` a `http://localhost:5173/gestion#/asistente` y pregunta
“¿cuántas citas hubo por especialidad este mes?”. Debe responder con datos reales y mostrar qué herramientas usó.
Para políticas: `#/politicas` → “¿cuál es el plazo para cancelar una cita sin cargo?” (debe decir 24 horas citando la política).
Si da error 503 con “Falta GEMINI_API_KEY”, el servicio no leyó el `.env`: reinícialo.

---

## 4. IA: modelos de ML reales (Kaggle)

Hoy los dos modelos están entrenados con **datos sintéticos** (el sistema lo avisa en pantalla). Para usar datos reales:

1. Crea una cuenta en <https://www.kaggle.com> → *Settings → API → Create New Token* (baja `kaggle.json`).
2. Guárdalo: `mkdir -p ~/.kaggle && mv ~/Descargas/kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json`
3. Acepta las reglas de los datasets (entra a cada página y pulsa *Download* o aceptar términos una vez):
   - “Medical Appointment No Shows” (`joniarroba/noshowappointments`)
   - “Chest X-Ray Images (Pneumonia)” (`paultimothymooney/chest-xray-pneumonia`)

### 4.1 Inasistencia a citas (rápido, minutos)
```bash
services/ms7-inteligencia/ml/.venv/bin/python ml/no-show/train.py
scripts/dev-services.sh stop ms7-ml && scripts/dev-services.sh start ms7-ml
```
Comprueba: `curl -s localhost:8007/model/info` → `"sintetico": false` y `"dataset"` ya no dice `sintetico`. Además la vista
`/gestion#/ml` deja de mostrar el aviso “Datos sintéticos”.

### 4.2 Neumonía en radiografías (lento: horas en CPU)
```bash
# prueba corta con datos reales (unos minutos), para ver que todo funciona:
ml/.venv/bin/python ml/pneumonia/train.py --subconjunto 200 --epocas 2 --epocas-ajuste 0
# entrenamiento completo:
ml/.venv/bin/python ml/pneumonia/train.py
```
El modelo queda en `ml/pneumonia/models/*.keras`. Para usarlo en MS5:
```bash
MODELO_PATH=$PWD/ml/pneumonia/models/<tu-modelo>.keras ALLOW_STUB=false scripts/dev-services.sh start ms5-inference
```
(antes `stop ms5-inference`). Comprueba: `curl -s localhost:8005/health` debe decir `"clinico": true`.
Para el validador local de la PWA/móvil: `ml/pneumonia/convertir.py` (genera TFLite y TF.js).

> Son modelos académicos: apoyo a la decisión, **no** un diagnóstico. La app lo avisa en pantalla.

---

## 5. Micrófono (voz del asistente)

1. Abre `http://localhost:5173/gestion#/asistente` con Chrome o Edge.
2. Pulsa el micrófono y acepta el permiso. Di una consulta (“citas por especialidad”).
3. Debe transcribir y consultar al agente. Sin conexión o en Firefox usa el servicio Whisper local:
   `scripts/dev-services.sh start ms7-whisper` (la primera vez descarga el modelo, puede tardar).

---

## 6. App móvil (opcional, es lo único sin probar en dispositivo)

1. Instala Android Studio (emulador) o conecta un teléfono con depuración USB (acepta el diálogo en el teléfono).
2. `cd apps/mobile_flutter && flutter pub get`.
3. Emulador: `flutter run --dart-define=API_URL=http://10.0.2.2:8090 --dart-define=KEYCLOAK_URL=http://10.0.2.2:8080`
   (`10.0.2.2` es el “localhost” del emulador).
   Teléfono por USB: `adb reverse tcp:8080 tcp:8080 && adb reverse tcp:8090 tcp:8090` y
   `flutter run --dart-define=API_URL=http://localhost:8090 --dart-define=KEYCLOAK_URL=http://localhost:8080`
   (así el *issuer* que ve el teléfono es el mismo `localhost` que ven los servicios).
4. Entra con `paciente` / `Sigec123!`.
5. Prueba: ver citas, solicitar una cita **con el modo avión activado** (queda “Pendiente”), desactivarlo y ver que se confirma.

Si el login falla, lo más probable es que el *issuer* de Keycloak que ve el emulador (`10.0.2.2`) no coincida con el que ven los servicios: dímelo y lo ajusto.

---

## Cómo avisarme

Cuando termines un punto dime solo el número (“ya hice 1 y 2”). Yo entonces:
- **1 y 2:** recreo n8n, mando correo y Telegram reales, reservo una cita sin simulación y verifico que llegó el correo (por la API de Mailtrap),
  que el paciente quedó vinculado y que, con un token inválido a propósito, MS8 reintenta, pasa a `FALLIDA` y n8n avisa al chat de alertas.
- **3:** corro el E2E de MS7 (`scripts/e2e-ms7.sh`) con el LLM real y reviso las respuestas del asistente.
- **4:** vuelvo a correr `e2e-imagenes.sh` y las pruebas de ML con el modelo real y reviso las métricas.
- **6:** reviso los errores del emulador contigo.
