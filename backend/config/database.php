<?php

declare(strict_types=1);

return [
    'default' => env('DB_CONNECTION', 'mysql'),
    'connections' => [
        'mysql' => [
            'driver' => 'mysql',
            'host' => env('DB_HOST', 'mysql'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'ysp_local'),
            'username' => env('DB_USERNAME', 'ysp_app'),
            'password' => is_readable((string) env('DB_PASSWORD_FILE', ''))
                ? trim((string) file_get_contents((string) env('DB_PASSWORD_FILE'))) : '',
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_0900_ai_ci',
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => 'InnoDB',
            'timezone' => '+00:00',
            'options' => [PDO::ATTR_TIMEOUT => 3],
        ],
    ],
    'migrations' => ['table' => 'migrations', 'update_date_on_publish' => true],
];
