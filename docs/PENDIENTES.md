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
