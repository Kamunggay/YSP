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

    protected $description = 'Verify the installed MySQL/InnoDB foundation and contract identities';

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
            $expectedTables = ['migrations', 'sessions', 'users', 'global_security_events', 'session_throttles',
                'organizations', 'chapters', 'provider_role_grants', 'memberships', 'roles', 'requesting_units', 'duty_grants',
                'authenticator_enrollments', 'user_recovery_codes', 'initial_provider_installations', 'chapter_provisionings',
                'provider_operation_attempts', 'provider_actor_attributions', 'provider_operations', 'provider_audit_events', 'provider_follow_up_intents'];
            sort($expectedTables);
            $actualTables = array_map(fn (object $table): string => $table->name, $tables);
            sort($actualTables);
            if ($actualTables !== $expectedTables || array_filter($tables, fn (object $table): bool => $table->engine !== 'InnoDB') !== []) {
                throw new RuntimeException('Unexpected baseline tables');
            }
            $migrations = $connection->table('migrations')->orderBy('migration')->pluck('migration')->all();
            $files = glob(database_path('migrations/*.php')) ?: [];
            $migrationHashes = [];
            foreach ($files as $file) {
                $migrationHashes[basename($file, '.php')] = hash('sha256', str_replace("\r\n", "\n", (string) file_get_contents($file)));
            }
            ksort($migrationHashes);
            if ($migrations !== array_keys($migrationHashes)) {
                throw new RuntimeException('Unexpected migration checkpoint');
            }
            $this->line(json_encode([
                'database' => 'MySQL',
                'version' => $server->version,
                'engine' => $server->engine,
                'migration' => end($migrations),
                'migrations' => $migrations,
                'tables' => $actualTables,
                'schema_sha256' => hash('sha256', json_encode($migrationHashes, JSON_THROW_ON_ERROR)),
                'contracts' => json_decode((string) file_get_contents(resource_path('contracts/session-runtime.json')), true, flags: JSON_THROW_ON_ERROR)['sources'],
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
