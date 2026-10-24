<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Contracts\Container\Container;
use Illuminate\Database\DatabaseManager;
use Illuminate\Http\JsonResponse;
use Throwable;

final class HealthController
{
    public function __invoke(DatabaseManager $database, Container $container): JsonResponse
    {
        try {
            $container->make('encrypter');
            $database->connection()->selectOne('SELECT 1');
            $available = true;
        } catch (Throwable) {
            $available = false;
        }

        $status = $available ? 'ok' : 'unavailable';

        return new JsonResponse(['status' => $status, 'database' => $status], $available ? 200 : 503, [
            'Cache-Control' => 'no-store, private',
        ]);
    }
}
