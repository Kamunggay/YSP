# Image indexes resolved from the official registries on 2026-10-24.
FROM composer:2.10.3@sha256:b6dcd72ca98fa19d0e5b8476de179859704891fad06dd9e0b96833d4c430a5fc AS composer
FROM php:8.4.27-cli-bookworm@sha256:496b5e02fe9fe44fcfb715023b931048111dc4e0bc719789d83c906be9f04b05 AS base
RUN docker-php-ext-install -j2 pdo_mysql
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
WORKDIR /app

FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
COPY composer.json composer.lock ./
RUN composer install --no-scripts --no-interaction --prefer-dist --no-progress

FROM base AS local
ENV COMPOSER_HOME=/tmp/composer
COPY --from=dependencies /app/vendor ./vendor
COPY . .
RUN composer dump-autoload --no-interaction && chown -R 10001:10001 storage bootstrap/cache
USER 10001:10001
EXPOSE 8080
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public", "public/index.php"]
