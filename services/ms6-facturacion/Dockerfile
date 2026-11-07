# MS6 Facturacion (Laravel). Contexto: services/ms6-facturacion. El mismo contenedor sirve para la API y los procesos de fondo
# (argumento: serve | relay | consume), ver docker-compose.full.yml.
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction --ignore-platform-reqs

FROM php:8.4-cli-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libpng-dev libfreetype6-dev libjpeg62-turbo-dev libzip-dev unzip curl \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" pdo_pgsql gd bcmath sockets pcntl zip \
 && rm -rf /var/lib/apt/lists/*
COPY --from=vendor /usr/bin/composer /usr/bin/composer
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN rm -f .env bootstrap/cache/*.php \
 && composer dump-autoload --no-dev --optimize --no-interaction \
 && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
 && chown -R www-data:www-data storage bootstrap/cache
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER www-data
ENV PHP_CLI_SERVER_WORKERS=4
EXPOSE 8006
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["serve"]
