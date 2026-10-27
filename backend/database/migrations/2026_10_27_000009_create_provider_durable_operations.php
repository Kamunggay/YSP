<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chapters', function (Blueprint $table): void {
            $table->unique(['organization_id', 'code']);
            $table->dropUnique('chapters_code_unique');
            $table->unique(['organization_id', 'id']);
        });
        Schema::create('chapter_provisionings', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('provider_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('chapter_id')->unique();
            $table->enum('status', ['awaiting_initial_head', 'initial_head_designated'])->default('awaiting_initial_head');
            $table->unsignedInteger('row_version')->default(1);
            $table->timestamp('created_at', 6);
            $table->foreign(['organization_id', 'chapter_id'])->references(['organization_id', 'id'])->on('chapters')->restrictOnDelete();
            $table->index(['organization_id', 'provider_user_id', 'id']);
        });
        DB::statement('ALTER TABLE chapter_provisionings ADD CONSTRAINT chapter_provisionings_version CHECK (row_version BETWEEN 1 AND 2147483647)');
        Schema::create('provider_operation_attempts', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->char('public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('provider_user_id')->constrained('users')->restrictOnDelete();
            $table->string('action_code', 64)->charset('ascii')->collation('ascii_bin');
            $table->string('idempotency_key', 128)->charset('ascii')->collation('ascii_bin');
            $table->char('payload_hash', 64)->charset('ascii')->collation('ascii_bin');
            $table->string('input_schema', 100)->charset('ascii')->collation('ascii_bin');
            $table->timestamp('created_at', 6);
            $table->unique(['organization_id', 'provider_user_id', 'action_code', 'idempotency_key'], 'provider_attempt_namespace');
        });
        Schema::create('provider_actor_attributions', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('attempt_id')->unique()->constrained('provider_operation_attempts')->restrictOnDelete();
            $table->foreignId('provider_role_grant_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('authority_version');
            $table->json('actor_snapshot');
            $table->timestamp('occurred_at', 6);
        });
        Schema::create('provider_operations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('attempt_id')->unique()->constrained('provider_operation_attempts')->restrictOnDelete();
            $table->foreignId('actor_attribution_id')->unique()->constrained('provider_actor_attributions')->restrictOnDelete();
            $table->enum('outcome', ['committed', 'rejected']);
            $table->unsignedInteger('result_schema_version')->default(1);
            $table->unsignedSmallInteger('http_status');
            $table->json('result_snapshot');
            $table->timestamp('committed_at', 6);
        });
        Schema::create('provider_audit_events', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('operation_id')->constrained('provider_operations')->restrictOnDelete();
            $table->string('event_code', 64)->charset('ascii')->collation('ascii_bin');
            $table->json('after_snapshot');
            $table->timestamp('occurred_at', 6);
        });
        Schema::create('provider_follow_up_intents', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('operation_id')->constrained('provider_operations')->restrictOnDelete();
            $table->string('task_kind', 48)->charset('ascii')->collation('ascii_bin');
            $table->string('effect_key', 128)->charset('ascii')->collation('ascii_bin');
            $table->unsignedInteger('payload_schema_version')->default(1);
            $table->json('payload');
            $table->timestamp('created_at', 6);
            $table->unique(['operation_id', 'task_kind', 'effect_key'], 'provider_follow_up_effect');
        });
        foreach (['provider_operation_attempts', 'provider_actor_attributions', 'provider_operations', 'provider_audit_events', 'provider_follow_up_intents'] as $table) {
            foreach (['UPDATE', 'DELETE'] as $event) {
                DB::unprepared("CREATE TRIGGER {$table}_no_{$event} BEFORE {$event} ON {$table} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Provider operation history is immutable'");
            }
        }
        $connection = DB::connection();
        $schema = '`'.str_replace(['\\', '`', '_', '%'], ['\\\\', '``', '\\_', '\\%'], $connection->getDatabaseName()).'`';
        $pdo = $connection->getPdo();
        $account = $pdo->quote((string) config('database.runtime_username')).'@'.$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("REVOKE UPDATE, DELETE ON {$schema}.* FROM {$account}");
        // Insert-only history gets SELECT/INSERT through the schema grant. Mutable
        // lifecycle tables receive explicit mutation grants, never history tables.
        $database = '`'.str_replace('`', '``', $connection->getDatabaseName()).'`';
        foreach (['sessions', 'users', 'session_throttles', 'organizations', 'chapters', 'provider_role_grants', 'memberships', 'roles', 'requesting_units', 'duty_grants', 'authenticator_enrollments', 'user_recovery_codes', 'chapter_provisionings'] as $table) {
            DB::unprepared("GRANT UPDATE, DELETE ON {$database}.`{$table}` TO {$account}");
        }
    }

    public function down(): void
    {
        foreach (['provider_follow_up_intents', 'provider_audit_events', 'provider_operations', 'provider_actor_attributions', 'provider_operation_attempts', 'chapter_provisionings'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('chapters', function (Blueprint $table): void {
            $table->unique('code');
            $table->dropUnique('chapters_organization_id_code_unique');
            $table->dropUnique('chapters_organization_id_id_unique');
        });
    }
};
