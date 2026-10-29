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
        Schema::create('chapter_control_guards', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->foreignId('chapter_id')->primary()->constrained()->restrictOnDelete();
            $table->unsignedInteger('authority_version')->default(1);
            $table->unsignedInteger('block_version')->default(1);
            $table->unsignedInteger('readiness_version')->default(1);
            $table->timestamp('updated_at', 6)->useCurrent();
        });
        DB::statement('INSERT INTO chapter_control_guards (chapter_id) SELECT id FROM chapters');
        DB::statement('ALTER TABLE chapter_control_guards ADD CONSTRAINT control_guard_versions CHECK (authority_version BETWEEN 1 AND 2147483647 AND block_version BETWEEN 1 AND 2147483647 AND readiness_version BETWEEN 1 AND 2147483647)');
        Schema::create('initial_head_bootstraps', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('designation_id')->unique()->constrained('initial_head_designations')->restrictOnDelete();
            $table->foreignId('membership_id')->unique()->constrained('memberships')->restrictOnDelete();
            $table->foreignId('duty_grant_id')->unique()->constrained('duty_grants')->restrictOnDelete();
            $table->foreignId('approved_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('executed_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('operator_reference', 160);
            $table->string('approval_reference', 500);
            $table->char('payload_hash', 64)->charset('ascii')->collation('ascii_bin');
            $table->json('approval_snapshot');
            $table->json('result_snapshot');
            $table->timestamp('installed_at', 6);
            $table->foreign(['chapter_id', 'designation_id'])->references(['chapter_id', 'id'])->on('initial_head_designations')->restrictOnDelete();
            $table->foreign(['chapter_id', 'membership_id'])->references(['chapter_id', 'id'])->on('memberships')->restrictOnDelete();
            $table->foreign(['chapter_id', 'duty_grant_id'])->references(['chapter_id', 'id'])->on('duty_grants')->restrictOnDelete();
        });
        DB::statement('ALTER TABLE initial_head_bootstraps ADD CONSTRAINT bootstrap_independent_executor CHECK (approved_by_user_id <> executed_by_user_id)');
        foreach (['UPDATE', 'DELETE'] as $event) {
            DB::unprepared("CREATE TRIGGER initial_head_bootstraps_no_{$event} BEFORE {$event} ON initial_head_bootstraps FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Initial Head bootstrap history is immutable'");
        }
        $pdo = DB::connection()->getPdo();
        $database = '`'.str_replace('`', '``', DB::connection()->getDatabaseName()).'`';
        $account = $pdo->quote((string) config('database.runtime_username')).'@'.$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("GRANT UPDATE ON {$database}.chapter_control_guards TO {$account}");
    }

    public function down(): void
    {
        Schema::dropIfExists('initial_head_bootstraps');
        Schema::dropIfExists('chapter_control_guards');
    }
};
