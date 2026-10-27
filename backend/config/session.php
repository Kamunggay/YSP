<?php

declare(strict_types=1);

$origin = parse_url((string) env('APP_URL', ''));
$loopback = env('APP_ENV', 'production') === 'local'
    && ($origin['scheme'] ?? '') === 'http'
    && in_array($origin['host'] ?? '', ['localhost', '127.0.0.1'], true);

return [
    'driver' => 'database',
    'lifetime' => 30,
    'expire_on_close' => false,
    'encrypt' => false,
    'connection' => 'mysql',
    'table' => 'sessions',
    'store' => null,
    'lottery' => [2, 100],
    'cookie' => 'ysp_session',
    'path' => '/',
    'domain' => null,
    'secure' => ! $loopback,
    'http_only' => true,
    'same_site' => 'lax',
    'partitioned' => false,
    'serialization' => 'json',
];
