FROM php:8.4-cli-bookworm@sha256:54b467ede1db96c66675e7b78457dd43729d0e7be31978d4a1e5c069ceabcf76 AS tools
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip libjpeg62-turbo-dev libpng-dev qpdf \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install pdo_mysql gd pcntl \
    && printf 'enable_post_data_reading=Off\npost_max_size=64M\nmemory_limit=256M\n' > "$PHP_INI_DIR/conf.d/paper-evidence.ini" \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2@sha256:4ed71c38c6d788eb4e4e3747b5332f5b40d5b5a6fcadd5062a1a70986a118e0a /usr/bin/composer /usr/local/bin/composer
WORKDIR /app

FROM tools AS app
COPY composer.json composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-scripts --no-progress
COPY . .
RUN touch .env \
    && composer dump-autoload --no-interaction \
    && mkdir -p storage/app/evidence \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]
