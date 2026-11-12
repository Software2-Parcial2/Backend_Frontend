# Desarrollo local sin construir imágenes

Para el día a día no hace falta `docker build`: Docker solo corre la infraestructura (imágenes públicas, nada que construir) y los
microservicios y frontends corren en tu máquina con recarga al guardar. Para demo/entrega usa la pila completa (`make up-core`, ver [docker.md](docker.md)).

```bash
cp .env.example .env          # solo la primera vez
make dev-local                # infraestructura + 9 servicios + procesos de fondo + 4 frontends
make dev-local-status         # estado de todo
scripts/dev-local.sh logs ms3 # log de un servicio o frontend (ms1..ms8, gateway, shell, remote-vue, remote-angular, pwa-paciente)
make dev-local-down           # para servicios y frontends (Docker sigue arriba); `scripts/dev-local.sh down --infra` también baja Docker
```

`make dev-local-ml` añade MS5-inference, MS7-ml y MS7-embeddings (necesitan sus `.venv`; ver `scripts/dev-services.sh`).
Opciones de `scripts/dev-local.sh up`: `--sin-frontends`, `--sin-backend`, `--ml`. Es idempotente: lo que ya está en su puerto no se toca.
Medido con la infraestructura ya descargada: todo `healthy` en menos de 100 s, sin ninguna construcción.

Primera vez con base vacía: `make keycloak-aplicar seed`. Usuarios (`Sigec123!`): `administrador`, `recepcion`, `medico`, `caja`, `paciente`.

## Qué hace `up`

1. `docker compose up -d --wait` (solo `docker-compose.yml`: Postgres, Mongo, DynamoDB, S3, RabbitMQ, Keycloak, n8n).
2. `dynamodb-init`, `rabbitmq-declare`, `mongo-init`, `s3-init` (repetibles).
3. `scripts/dev-services.sh start gateway ms1 … ms8`, `poller-start` (outbox de DynamoDB) y `workers-start` (relay y consumidores de MS6).
4. Frontends en modo desarrollo: shell `:5173`, PWA `:5174`, remote-vue `:5175`, remote-angular `:4201`.

## Qué recarga solo y qué no

| Parte | Al guardar |
|---|---|
| Servicios Nest (MS1, MS3, MS5, MS7, MS8) | Se reinician solos (`nest start --watch`). |
| Frontends (shell, PWA, remotos) | HMR de Vite/Rsbuild. |
| MS6 (Laravel) | Las peticiones HTTP usan el código nuevo; los procesos de fondo (`relay`, `consume`) hay que reiniciarlos: `scripts/dev-services.sh workers-stop && scripts/dev-services.sh workers-start`. |
| Gateway, MS2, MS4 (Spring) | **No** recargan (`spring-boot:run` sin devtools). Reinícialos: `scripts/dev-services.sh stop ms2 && scripts/dev-services.sh start ms2`. |
| Paquetes de `packages/*` | Se recompilan al arrancar un servicio; tras cambiarlos reinicia el servicio que los use. |

## Puertos ocupados por otro proyecto

Si el 5432 (Postgres) o el 8000 (DynamoDB) los usa otro proyecto, el script avisa. Define en `.env` o exporta antes de `make dev-local`:

```bash
export POSTGRES_HOST_PORT=5440 POSTGRES_PORT=5440 DB_PORT=5440
export DYNAMODB_HOST_PORT=8001 DYNAMODB_ENDPOINT=http://localhost:8001
```

## Nota sobre pnpm

`pnpm-workspace.yaml` lleva `strictDepBuilds: false`. Sin él, el `pnpm install` que ejecutan los `prestart:dev` de los servicios Nest falla con
`ERR_PNPM_IGNORED_BUILDS` (esbuild, lmdb, @parcel/watcher, msgpackr-extract). El Dockerfile ya pasaba este mismo ajuste.
