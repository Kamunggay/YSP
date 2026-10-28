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
        Schema::table('memberships', function (Blueprint $table): void {
            $table->unsignedInteger('row_version')->default(1);
            $table->foreignId('ended_by_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('revoked_at', 6)->nullable();
        });
        DB::statement('ALTER TABLE memberships ADD CONSTRAINT membership_row_version CHECK (row_version >= 1)');
        DB::unprepared("CREATE TRIGGER memberships_no_DELETE BEFORE DELETE ON memberships FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership identity is retained'");
        DB::unprepared("CREATE TRIGGER memberships_identity_UPDATE BEFORE UPDATE ON memberships FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.chapter_id <=> OLD.chapter_id AND NEW.user_id <=> OLD.user_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership identity is immutable'; END IF; END");
        Schema::create('membership_candidates', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('purpose', ['membership_authorization']);
            $table->foreignId('approved_by_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('executed_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('operator_reference', 160);
            $table->string('approval_reference', 500);
            $table->timestamp('authorized_at', 6);
            $table->timestamp('ends_at', 6)->nullable();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->index(['chapter_id', 'user_id', 'purpose']);
        });
        DB::statement('ALTER TABLE membership_candidates ADD CONSTRAINT membership_candidate_executor CHECK (approved_by_user_id <> executed_by_user_id), ADD CONSTRAINT membership_candidate_interval CHECK (ends_at IS NULL OR ends_at > authorized_at)');
        DB::unprepared("CREATE TRIGGER membership_candidates_no_DELETE BEFORE DELETE ON membership_candidates FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidate history is retained'");
        DB::unprepared("CREATE TRIGGER membership_candidates_guard_UPDATE BEFORE UPDATE ON membership_candidates FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.chapter_id <=> OLD.chapter_id AND NEW.user_id <=> OLD.user_id AND NEW.purpose <=> OLD.purpose AND NEW.approved_by_user_id <=> OLD.approved_by_user_id AND NEW.executed_by_user_id <=> OLD.executed_by_user_id AND NEW.operator_reference <=> OLD.operator_reference AND NEW.approval_reference <=> OLD.approval_reference AND NEW.authorized_at <=> OLD.authorized_at AND NEW.ends_at <=> OLD.ends_at) OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Candidate history is retained'; END IF; END");
        Schema::create('chapter_operations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->char('public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_user_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('actor_membership_id');
            $table->foreign(['chapter_id', 'actor_membership_id'])->references(['chapter_id', 'id'])->on('memberships')->restrictOnDelete();
            $table->string('action_code', 64)->charset('ascii')->collation('ascii_bin');
            $table->string('idempotency_key', 128)->charset('ascii')->collation('ascii_bin');
            $table->char('payload_hash', 64)->charset('ascii')->collation('ascii_bin');
            $table->string('input_schema', 96);
            $table->json('actor_snapshot');
            $table->json('before_snapshot')->nullable();
            $table->json('result_snapshot');
            $table->unsignedSmallInteger('http_status');
            $table->timestamp('committed_at', 6);
            $table->unique(['chapter_id', 'action_code', 'idempotency_key'], 'chapter_attempt_fence');
        });
        foreach (['UPDATE', 'DELETE'] as $event) {
            DB::unprepared("CREATE TRIGGER chapter_operations_no_{$event} BEFORE {$event} ON chapter_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Chapter operation history is immutable'");
        }
        $pdo = DB::connection()->getPdo();
        $database = '`'.str_replace('`', '``', DB::connection()->getDatabaseName()).'`';
        $account = $pdo->quote((string) config('database.runtime_username')).'@'.$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("GRANT UPDATE (revoked_at) ON {$database}.membership_candidates TO {$account}");
    }

    public function down(): void
    {
        Schema::dropIfExists('chapter_operations');
        Schema::dropIfExists('membership_candidates');
        DB::unprepared('DROP TRIGGER IF EXISTS memberships_no_DELETE');
        DB::unprepared('DROP TRIGGER IF EXISTS memberships_identity_UPDATE');
        DB::statement('ALTER TABLE memberships DROP CHECK membership_row_version');
        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropForeign(['ended_by_user_id']);
            $table->dropColumn(['row_version', 'ended_by_user_id', 'revoked_at']);
        });
    }
};
