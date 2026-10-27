<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $connection = DB::connection();
        // Database-level grants treat underscores and percent signs as patterns.
        $schema = '`'.str_replace(['\\', '`', '_', '%'], ['\\\\', '``', '\\_', '\\%'], $connection->getDatabaseName()).'`';
        $pdo = $connection->getPdo();
        $account = $pdo->quote((string) config('database.runtime_username')).'@'
            .$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("REVOKE IF EXISTS ALL PRIVILEGES ON {$schema}.* FROM {$account}");
        DB::unprepared("GRANT SELECT, INSERT, UPDATE, DELETE ON {$schema}.* TO {$account}");
    }

    public function down(): void
    {
        // A schema rollback must not silently restore runtime DDL privileges.
    }
};
