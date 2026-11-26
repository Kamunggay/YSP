<?php

$key = env('REVERB_APP_KEY', 'ysp-stage1');

return [
    'apps' => [
        'provider' => 'config',
        'apps' => [[
            'app_id' => $key,
            'key' => $key,
            'secret' => hash_hmac('sha256', 'ysp-notifications:channel', (string) (env('REVERB_APP_SECRET') ?: env('APP_KEY'))),
            'allowed_origins' => [parse_url(env('APP_URL', 'http://localhost:8080'), PHP_URL_HOST)],
            'ping_interval' => 30,
            'max_message_size' => 4096,
            'max_channels_per_connection' => 16,
            'accept_client_events_from' => 'none',
        ]],
    ],
];
