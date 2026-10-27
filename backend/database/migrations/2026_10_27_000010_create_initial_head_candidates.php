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
        Schema::create('initial_head_candidates', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('purpose', ['initial_head_appointment']);
            $table->foreignId('approved_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('executed_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('operator_reference', 160);
            $table->string('approval_reference', 500);
            $table->timestamp('authorized_at', 6);
            $table->timestamp('ends_at', 6)->nullable();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->index(['organization_id', 'user_id', 'purpose']);
        });
        DB::statement('ALTER TABLE initial_head_candidates ADD CONSTRAINT candidate_independent_executor CHECK (approved_by_user_id <> executed_by_user_id), ADD CONSTRAINT candidate_interval CHECK (ends_at IS NULL OR ends_at > authorized_at)');
        DB::unprepared("CREATE TRIGGER initial_head_candidates_no_DELETE BEFORE DELETE ON initial_head_candidates FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidate authorization history is retained'");
        DB::unprepared("CREATE TRIGGER initial_head_candidates_guard_UPDATE BEFORE UPDATE ON initial_head_candidates FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.organization_id <=> OLD.organization_id AND NEW.user_id <=> OLD.user_id AND NEW.purpose <=> OLD.purpose AND NEW.approved_by_user_id <=> OLD.approved_by_user_id AND NEW.executed_by_user_id <=> OLD.executed_by_user_id AND NEW.operator_reference <=> OLD.operator_reference AND NEW.approval_reference <=> OLD.approval_reference AND NEW.authorized_at <=> OLD.authorized_at AND NEW.ends_at <=> OLD.ends_at) OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidate authorization history is retained'; END IF; END");
        // Revocation is the only supported lifecycle update. No deletion grant.
        $pdo = DB::connection()->getPdo();
        $database = '`'.str_replace('`', '``', DB::connection()->getDatabaseName()).'`';
        $account = $pdo->quote((string) config('database.runtime_username')).'@'.$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("GRANT UPDATE (revoked_at) ON {$database}.initial_head_candidates TO {$account}");
    }

    public function down(): void
    {
        Schema::dropIfExists('initial_head_candidates');
    }
};
