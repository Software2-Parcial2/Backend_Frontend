# Pendientes y problemas encontrados

Cada entrada indica bloque, comando, error y que se probo.

## Bloque C - Laravel (MS6)

- **Extensiones PHP `gd` y `bcmath` no instaladas.** Comando: `php -m | grep -iE "^(gd|bcmath)$"` no devuelve nada.
  `gd` hace falta para imagenes en PDFs de dompdf; `bcmath` solo si se usa aritmetica de precision. No se instalan paquetes del sistema:
  en Fedora, `sudo dnf install php-gd php-bcmath` (lo ejecuta el usuario).
- `./vendor/bin/pest --init` queda esperando una respuesta interactiva y no termina en modo no interactivo; `tests/Pest.php` se genero igualmente.
- Las migraciones por defecto de Laravel (`users`, `cache`, `jobs`) siguen aplicadas aunque MS6 no las usa (sesion y cache en `array`, cola en RabbitMQ). Pueden eliminarse cuando se confirme.
