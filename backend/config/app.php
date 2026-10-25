<?php

declare(strict_types=1);

return [
    'name' => 'YSP',
    'env' => env('APP_ENV', 'local'),
    'debug' => false,
    'url' => env('APP_URL', 'http://localhost:8080'),
    'timezone' => 'UTC',
    'locale' => 'en',
    'fallback_locale' => 'en',
    'faker_locale' => 'en_US',
    'cipher' => 'AES-256-CBC',
    'key' => is_readable((string) env('APP_KEY_FILE', ''))
        ? trim((string) file_get_contents((string) env('APP_KEY_FILE'))) : '',
    'previous_keys' => [],
    'maintenance' => ['driver' => 'file'],
];
