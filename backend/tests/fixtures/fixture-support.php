<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

// Test-only primitives; never expose SQL, stdin, credentials or exception messages.
function installFixtureFailureHandler(): void
{
    set_exception_handler(static function (Throwable $error): never {
        fwrite(STDERR, 'Fixture failed: '.$error::class.' at '.basename($error->getFile()).':'.$error->getLine().PHP_EOL);
        exit(1);
    });
}

/** @param array<string, mixed> $values */
function insertFixtureId(string $table, array $values): string
{
    DB::table($table)->insert($values);

    return DB::connection()->getPdo()->lastInsertId();
}
