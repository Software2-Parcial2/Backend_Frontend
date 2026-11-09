# SIGEC en Docker: levantar, verificar y operar

Guía práctica de la pila completa en contenedores (`docker-compose.yml` + `docker-compose.full.yml`). Para el mapa de servicios y bases de datos ver el [README](../README.md).

## Requisitos

- Docker con Compose v2 y BuildKit (se usó Docker 29). varios GB libres en disco (solo `ms7-api` pesa ~1,5 GB; el ML añade más) y RAM suficiente para ~22 contenedores (no medida).
- Acceso a internet en la primera construcción (Maven, npm, Composer, imágenes base).
- Puertos libres en el host: 5173-5175, 4201, 8080, 8082, 8084, 8090, 8006, 3003, 3005, 3007, 3008, 5432, 27017, 8000, 9000, 5672, 15672, 5678.
  Si 5432, 27017 u 8000 están ocupados por otro proyecto, define en `.env` `POSTGRES_HOST_PORT`, `MONGO_HOST_PORT` o `DYNAMODB_HOST_PORT`
  (p. ej. `POSTGRES_HOST_PORT=5440`). Dentro de la red de Docker los servicios siguen usando los puertos normales.

## Primera vez

```bash
cp .env.example .env
```

Edita `.env`:

| Variable | Valor | Motivo |
|---|---|---|
| Todas las `cambia_esto` | Contraseñas propias (`openssl rand -hex 24` para las claves largas) | Seguridad |
| `LLM_PROVIDER` | `simulated` (sin API key) o `gemini` / `claude` con su clave | Con `gemini` y sin `GEMINI_API_KEY` el agente de MS7 falla |
| `NOTIF_SENDER` | `simulated` (demo) o `n8n` (requiere Mailtrap/Telegram) | Con `n8n` sin credenciales las notificaciones quedan `FALLIDA` |
| `MS6_APP_KEY` (opcional) | `base64:...` | Si no se define, MS6 genera una clave efímera al arrancar |

Luego:

```bash
make up-core        # construye las imágenes y levanta todo menos el ML pesado
make ps-all         # espera a que los servicios con healthcheck estén "healthy"
make n8n-import     # solo la primera vez (o tras borrar volúmenes): importa y activa los workflows de n8n
```

### Tiempos orientativos

Medidos en esta máquina durante el desarrollo (la red hacia el registro de npm era lenta); los tuyos pueden variar.

| Paso | Tiempo |
|---|---|
| Construcción completa de las 16 imágenes de negocio, primera vez | ~5 min (la instalación de Angular sola tardó ~90 s por la red) |
| Reconstrucción con la caché de capas caliente (cambió poco código) | segundos a ~1-2 min por servicio cambiado |
| Arranque hasta `healthy` con las imágenes ya construidas | ~1-2 min (Spring y Keycloak son los más lentos) |
| `make up-all` por primera vez (añade TensorFlow, Whisper y embeddings) | varios minutos más de construcción + ~930 MB de modelos descargados al primer arranque (no medido) |

## Qué se levanta

`make up-core` (22 contenedores):

| Grupo | Contenedores |
|---|---|
| Infraestructura | `postgres`, `mongo`, `dynamodb`, `s3`, `rabbitmq`, `keycloak`, `n8n` |
| Inicialización (corre una vez y termina con "Exited (0)", es normal) | `init` — tablas DynamoDB, topología RabbitMQ, bucket S3, colección Mongo |
| Servicios | `gateway`, `ms2`, `ms3`, `ms4`, `ms5-api`, `ms6`, `ms7-api`, `ms8` |
| Procesos de fondo | `outbox-poller` (outbox de DynamoDB → RabbitMQ), `ms6-outbox-relay`, `ms6-saga-consumer` |
| Frontends | `shell` (5173), `pwa-paciente` (5174), `remote-vue` (5175), `remote-angular` (4201) |

`make up-all` añade `ms7-ml`, `ms7-embeddings`, `ms7-whisper` (perfil `ml`) y `ms5-inference` (perfil `inferencia`).
Sin ellos, MS7 no tiene RAG, voz ni predicción de inasistencia, y MS5 no analiza radiografías.
La app móvil (Flutter) no corre en Docker.

## Usuarios y cómo crear uno para verificar

El realm `sigec` se importa de `infra/keycloak/realm-sigec.json` con un usuario por rol, contraseña `Sigec123!` (solo desarrollo):
`administrador`, `medico`, `recepcion`, `caja` y `paciente`. El usuario `paciente` lleva el atributo `paciente_id = a0000000-0000-4000-8000-000000000001`.

### Opción A: consola de Keycloak (la más simple)

1. Abre <http://localhost:8080> → *Administration Console*. Usuario y contraseña: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` de tu `.env`.
2. Arriba a la izquierda cambia del realm `master` a **`sigec`**.
3. *Users* → *Create new user*: rellena `Username`, `Email`, `First name`, `Last name`, activa *Email verified* → *Create*.
4. Pestaña *Credentials* → *Set password* → desactiva *Temporary*.
5. Pestaña *Role mapping* → *Assign role* → elige el rol (`recepcion`, `medico`, `caja`, `administrador` o `paciente`).
6. Solo para un `paciente`: pestaña *Attributes* → clave `paciente_id`, valor el UUID del paciente en MS2.

### Opción B: línea de comandos (kcadm, dentro del contenedor)

```bash
set -a; source .env; set +a
KC="docker exec sigec-keycloak-1 /opt/keycloak/bin/kcadm.sh"
$KC config credentials --server http://localhost:8080 --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD"
$KC create users -r sigec -s username=ana -s enabled=true -s emailVerified=true -s email=ana@example.com -s firstName=Ana -s lastName=Prueba
$KC set-password -r sigec --username ana --new-password 'Clave123!'
$KC add-roles -r sigec --uusername ana --rolename recepcion
```

> Los comandos de `kcadm` no se ejecutaron al escribir esta guía; si alguno falla, usa la opción A.

Un usuario creado a mano **vive en la base `keycloak` de PostgreSQL**: sobrevive a `make down-all`, pero se pierde con `down -v` o si se reimporta el realm. Si quieres que sea permanente, añádelo a `infra/keycloak/realm-sigec.json` (es la fuente de verdad).

### Verificar que el usuario funciona

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/sigec/protocol/openid-connect/token \
  -d grant_type=password -d client_id=sigec-shell -d username=ana -d 'password=Clave123!' | jq -r .access_token)
echo "${#TOKEN} caracteres"                                   # >0 = login correcto
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/pacientes   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/api/pacientes                                      # 401 (sin token)
```

Un `403` significa que el rol no tiene permiso para ese endpoint (p. ej. `rag/estado` es solo de `administrador`). En el navegador: <http://localhost:5173> → iniciar sesión.

## Verificación rápida de que todo está sano

```bash
make ps-all                                                    # todo "Up"; los que tienen healthcheck, "healthy"; "init" Exited (0)
for u in 8090/actuator/health 8082/actuator/health 8084/actuator/health 3003/health 3005/health 3007/health 3008/health 8006/api/facturacion/health 5173/healthz; do
  printf '%-32s %s\n' $u "$(curl -s -m 4 -o /dev/null -w '%{http_code}' localhost:$u)"; done      # todos 200
docker exec sigec-rabbitmq-1 rabbitmqctl list_queues name messages consumers | grep -E 'dlq|saga'  # las *.dlq en 0; ms6.saga.comandos con 1 consumidor
```

## Día a día: ¿basta con `make up-core`?

**Sí.** Después de la primera vez, `make up-core` es todo lo que necesitas:

- Reconstruye solo lo que cambió (el resto sale de la caché) y recrea solo los contenedores afectados. Es seguro ejecutarlo varias veces.
- Los datos (PostgreSQL, MongoDB, DynamoDB, S3, RabbitMQ, n8n) viven en volúmenes de Docker y se conservan.
- `init` se ejecuta en cada arranque; es repetible y no duplica nada.
- `make n8n-import` **no** hace falta repetirlo mientras no borres el volumen `n8n_data`.
- Si no cambiaste código y solo quieres arrancar más rápido: `docker compose -f docker-compose.yml -f docker-compose.full.yml up -d` (sin `--build`).

| Quiero… | Comando |
|---|---|
| Levantar todo (sin ML) | `make up-core` |
| Levantar todo con ML | `make up-all` |
| Ver el estado | `make ps-all` |
| Parar conservando datos | `make down-all` |
| Parar y **borrar todos los datos** | `docker compose -f docker-compose.yml -f docker-compose.full.yml --profile ml --profile inferencia down -v` |
| Ver los logs de un servicio | `docker logs -f sigec-ms3-1` (nombre: `sigec-<servicio>-1`) |
| Reconstruir solo un servicio tras editarlo | `docker compose -f docker-compose.yml -f docker-compose.full.yml up -d --build ms3` |
| Meter datos de ejemplo | `make seed` (ver `scripts/seed/README.md`; no probado contra esta pila) |

No mezcles esta pila con `scripts/dev-services.sh` (servicios en el host): usan los mismos puertos. Para desarrollar con recarga en caliente, deja solo la infraestructura en Docker (`docker compose up -d`) y arranca los servicios con ese script.

## Problemas ya vistos

| Síntoma | Causa | Solución |
|---|---|---|
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Otro Postgres ocupa el puerto | `POSTGRES_HOST_PORT=5440` en `.env` y `make up-core` |
| `dependency failed to start: container sigec-ms6-1 is unhealthy` | Postgres aún no estaba listo | Repetir `make up-core` (ya hay 60 s de margen y 30 reintentos) |
| `ms6.saga.comandos` con mensajes y 0 consumidores | `ms6-saga-consumer` no estaba corriendo | `make up-core`; ver `docker logs sigec-ms6-saga-consumer-1` |
| `ERR_PNPM_IGNORED_BUILDS` al construir | pnpm 12 exige aprobar scripts de instalación | Ya resuelto en `infra/docker/*.Dockerfile` |
| Notificaciones `FALLIDA` | `NOTIF_SENDER=n8n` sin Mailtrap/Telegram | `NOTIF_SENDER=simulated` en `.env` y `make up-core` |
| El agente de MS7 responde error de proveedor | `LLM_PROVIDER=gemini` sin clave | `LLM_PROVIDER=simulated` o define la clave |

## Qué no cubre esta pila

La Lambda `lambda-outbox` en AWS (aquí la reemplaza `outbox-poller`), la app móvil, los E2E (`make e2e-saga`, `scripts/e2e-*.sh`: están escritos para servicios en el host),
y cualquier configuración de producción (Keycloak en modo desarrollo, sin TLS, contraseñas de ejemplo).
