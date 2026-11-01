# Pendientes y problemas encontrados

Cada entrada indica bloque, comando, error y que se probo.

## Bloque C - Laravel (MS6)

- **Extensiones PHP `gd` y `bcmath` no instaladas.** Comando: `php -m | grep -iE "^(gd|bcmath)$"` no devuelve nada.
  `gd` hace falta para imagenes en PDFs de dompdf; `bcmath` solo si se usa aritmetica de precision. No se instalan paquetes del sistema:
  en Fedora, `sudo dnf install php-gd php-bcmath` (lo ejecuta el usuario).
- `./vendor/bin/pest --init` queda esperando una respuesta interactiva y no termina en modo no interactivo; `tests/Pest.php` se genero igualmente.
- Las migraciones por defecto de Laravel (`users`, `cache`, `jobs`) siguen aplicadas aunque MS6 no las usa (sesion y cache en `array`, cola en RabbitMQ). Pueden eliminarse cuando se confirme.

## Bloque E - Frontends

- **`pnpm lint` en `apps/pwa-paciente` falla** (ya fallaba antes de este bloque): `typescript-eslint does not support TS 7.0`.
  El proyecto usa `typescript ~7.0.2`. Opciones: fijar `typescript` a 6.x en esa app o esperar soporte de typescript-eslint para TS 7.x.
- **`apps/mobile`**: `app.json` ya tiene `scheme: sigec` y `com.sigec.mobile`, pero las carpetas generadas `ios/` y `android/`
  (ignoradas por Git) conservan `com.anonymous.mobile`. Hay que regenerarlas con `npx expo prebuild --clean` antes de compilar. No se compilo el movil.
- **Verificacion en navegador**: se hizo con Firefox 159 (headless, via puppeteer-core/WebDriver BiDi). No se probo en Chrome/Edge/Safari.
  El remoto Angular depende de import maps dinamicos: en el shell se usa `es-module-shims` en modo shim.
- **Native Federation en dev**: el servidor de `ng serve` responde `Access-Control-Allow-Origin: *`; la opcion `headers` anadida en `angular.json` no tiene efecto visible.
- **PWA offline**: solo hay service worker (generateSW), manifest y el indicador "en linea / sin conexion". La logica offline de datos queda pendiente.
  El manifest usa un icono SVG; para instalar en todos los navegadores hacen falta iconos PNG de 192 y 512 px.
  El estado "sin conexion" se verifico disparando el evento `offline` del navegador, no cortando la red real.
- **Keycloak**: `sslRequired: none` y `directAccessGrantsEnabled: true` en los 3 clientes son solo para desarrollo.

## Bloques F-I - Mensajeria, idempotencia, outbox y SAGA

Todo lo de estos bloques esta implementado y verificado (suites verdes y `make e2e-saga`: 51/51). Queda pendiente o conviene revisar:

**Desviaciones respecto a lo pedido**
- **Tablas de MS8 con prefijo `ms8_`** (`ms8_idempotency_keys`, `ms8_outbox`, `ms8_processed_messages`): MS3 y MS8 comparten la misma instancia de
  DynamoDB (y la misma cuenta en AWS), asi que no pueden llamarse igual. Los nombres se configuran por entorno (`IDEMPOTENCY_TABLE`, `OUTBOX_TABLE`, `PROCESSED_TABLE`).
- **Relay de Spring (MS2/MS4) sin puerto de aplicacion:** `OutboxRelay` es un adaptador de infraestructura (lee la tabla, publica, marca); no hay
  caso de uso en `application` porque no tiene logica de negocio.
- **DynamoDB Local como root** (`user: root` en el compose) por permisos del volumen nuevo. Solo desarrollo.
- **Indice `gsi1` en la tabla `citas`** (disperso: plazos de SAGA y notificaciones pendientes). No estaba en la peticion; hace que el barrido no haga Scan.

**Limitaciones conocidas**
- Notificaciones: el envio real (n8n / Mailtrap / Telegram) no existe; MS8 usa un adaptador **simulado** (`SimulatedSender`).
- La Lambda `lambda-outbox` se compila (`npm run build`) y se prueba con el poller local, pero **no se ha desplegado ni probado en AWS** (ni el event source
  mapping con `ReportBatchItemFailures`). El poller local guarda el checkpoint en `/tmp` y asume pocos shards.
- Las pruebas de fallo de RabbitMQ/backoff de los relays de Spring y Laravel son manuales (`scripts/test-outbox.sh`); no hay prueba automatica del backoff.
- Idempotencia de consumidores: el arrendamiento (`PROCESANDO`, 60 s) asume handlers mas rapidos que eso.
- Si el proceso muere con una clave de `Idempotency-Key` en `PROCESANDO`, queda bloqueada hasta que expira (24 h): compromiso documentado en `contracts/idempotency.md`.
- `scripts/e2e-saga.sh` detiene los servicios que arranca y tarda ~4 min; usa horarios aleatorios (nunca limpia DynamoDB).
- MS5 y MS7 todavia no usan mensajeria ni idempotencia.

## Bloque 0 (seguridad y calidad)

Hecho: claim `paciente_id` (realm + MS2/MS3/MS6), listados de citas por indices con cursor, validacion Ajv de cada mensaje contra su schema
(Nest: publicador y consumidores; mensaje invalido -> DLQ con el motivo) y `make dlq-replay`. Observaciones y limites:

- **Realm recreado:** para activar el perfil de usuario con `paciente_id` hubo que borrar el realm `sigec` (API de administracion) y reimportarlo desde
  `infra/keycloak/realm-sigec.json`. Cualquier usuario creado a mano en ese realm se perdio; el JSON es la fuente de verdad.
- El usuario `paciente` apunta al `paciente_id` fijo `a0000000-0000-4000-8000-000000000001`. **No existe una fila en MS2** con ese id (MS2 genera los ids);
  para datos coherentes habria que sembrarla o dar de alta pacientes con el id del usuario Keycloak.
- El rol `medico` ve todas las citas (necesita ver agendas); no hay vinculo `medico_id` con el usuario, asi que no se restringe a "sus" citas.
- Las citas anteriores a los indices se rellenaron con `make dynamodb-init` (idempotente). El indice general `gsi4` usa una unica particion (`CITA`): vale
  para este volumen; con mucho trafico habria que repartirla por mes.
- La validacion Ajv solo existe en Nest. MS6 (PHP) y Spring validan el sobre pero no el payload por schema.
- Un backlog de mensajes venenosos retrasa el consumidor de MS6 (~1 s por fallo, por el log de la excepcion); no lo bloquea. Hay que revisar las DLQ.
- `dlq-replay` mueve mensajes a la cola original por el exchange por defecto; no filtra por tipo ni por id.
