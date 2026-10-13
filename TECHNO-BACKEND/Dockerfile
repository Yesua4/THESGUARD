# Builds the Laravel API. Used as TWO separate services (on Render or
# Railway): the "web" process (this API) and the "reverb" process
# (websocket server) -- see docker-entrypoint.sh. Set PROCESS_TYPE=reverb
# on the second service's env vars to switch which one runs.

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --ignore-platform-reqs

FROM php:8.2-cli-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev libzip-dev zip unzip git \
    && docker-php-ext-install pdo pdo_pgsql pgsql pcntl zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN composer dump-autoload --optimize --no-dev \
    && chmod +x docker-entrypoint.sh \
    && mkdir -p storage/framework/{cache,sessions,testing,views} storage/logs bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

EXPOSE 10000
CMD ["./docker-entrypoint.sh"]
