<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\DatabaseManager;
use RuntimeException;
use Throwable;

final class VerifyBaseline extends Command
{
    protected $signature = 'baseline:verify';

    protected $description = 'Verify the P01 MySQL/InnoDB migration checkpoint without business data';

    public function handle(DatabaseManager $database): int
    {
        try {
            if ($database->getDefaultConnection() !== 'mysql') {
                throw new RuntimeException('Unsupported connection');
            }
            $connection = $database->connection();
            $server = $connection->selectOne(
                'SELECT VERSION() AS version, @@version_comment AS comment, @@default_storage_engine AS engine'
            );
            if (! str_starts_with($server->version, '8.4.')
                || ! str_contains($server->comment, 'MySQL')
                || $server->engine !== 'InnoDB') {
                throw new RuntimeException('Unsupported server');
            }
            $tables = $connection->select(
                'SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
            );
            if (count($tables) !== 1 || $tables[0]->name !== 'migrations' || $tables[0]->engine !== 'InnoDB') {
                throw new RuntimeException('Unexpected baseline tables');
            }
            $migrations = $connection->table('migrations')->pluck('migration')->all();
            if ($migrations !== ['0001_01_01_000000_health_baseline']) {
                throw new RuntimeException('Unexpected migration checkpoint');
            }
            $this->line(json_encode([
                'database' => 'MySQL',
                'version' => $server->version,
                'engine' => $server->engine,
                'migration' => $migrations[0],
                'laravel' => app()->version(),
                'php' => PHP_VERSION,
            ], JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        } catch (Throwable) {
            $this->error('Baseline verification failed; check local configuration and migrations.');

            return self::FAILURE;
        }
    }
}
