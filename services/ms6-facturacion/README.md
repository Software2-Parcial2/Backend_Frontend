# MS6 - Facturacion (Laravel)

API de facturacion de SIGEC (solo API, sin frontend). PostgreSQL `ms6_facturacion`, cola en RabbitMQ y JWT de Keycloak.

```bash
cp .env.example .env && php artisan key:generate   # ajusta DB_PASSWORD y RABBITMQ_PASSWORD
php artisan migrate
php artisan serve --port=8006                      # puerto de MS6: 8006
./vendor/bin/pest                                  # pruebas
```

- `GET /api/facturacion/health`: publico.
- `GET /api/facturacion/facturas`: requiere `Authorization: Bearer <JWT de Keycloak>`.
- El JWKS de Keycloak se cachea 10 minutos en el store `file` (el store por defecto es `array`).

