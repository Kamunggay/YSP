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
        Schema::table('duty_grants', function (Blueprint $table): void {
            $table->unsignedInteger('row_version')->default(1);
            $table->foreignId('authorized_by_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('authorized_at', 6)->nullable();
        });
        DB::statement('ALTER TABLE duty_grants MODIFY monetary_limit DECIMAL(20,2) NULL, ADD CONSTRAINT duty_grant_row_version CHECK (row_version >= 1)');
        // Chapter outcomes retain the complete original terms, reason, actor and
        // result atomically; the grant keeps the immutable initial attribution.
        DB::unprepared("CREATE TRIGGER duty_grants_identity_UPDATE BEFORE UPDATE ON duty_grants FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.chapter_id <=> OLD.chapter_id AND NEW.membership_id <=> OLD.membership_id AND NEW.role_id <=> OLD.role_id AND NEW.scope_kind <=> OLD.scope_kind AND NEW.requesting_unit_id <=> OLD.requesting_unit_id AND NEW.authorized_by_user_id <=> OLD.authorized_by_user_id AND NEW.authorized_at <=> OLD.authorized_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Grant identity and attribution are immutable'; END IF; END");
        DB::unprepared("CREATE TRIGGER duty_grants_no_DELETE BEFORE DELETE ON duty_grants FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Grant history is retained'");
        Schema::table('chapter_operations', function (Blueprint $table): void {
            $table->json('input_snapshot')->nullable();
        });
        Schema::create('duty_grant_limit_approvals', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('assigning_membership_id');
            $table->foreign(['chapter_id', 'assigning_membership_id'], 'grant_limit_assigning_membership_fk')->references(['chapter_id', 'id'])->on('memberships')->restrictOnDelete();
            $table->foreignId('role_id')->constrained('roles')->restrictOnDelete();
            $table->enum('scope_kind', ['chapter', 'unit']);
            $table->unsignedBigInteger('requesting_unit_id')->nullable();
            $table->foreign(['chapter_id', 'requesting_unit_id'], 'grant_limit_unit_fk')->references(['chapter_id', 'id'])->on('requesting_units')->restrictOnDelete();
            $table->decimal('monetary_limit', 20, 2);
            $table->timestamp('starts_at', 6);
            $table->timestamp('ends_at', 6)->nullable();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->foreignId('approved_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('approval_reference', 500);
            $table->timestamp('approved_at', 6);
        });
        DB::statement("ALTER TABLE duty_grant_limit_approvals ADD CONSTRAINT grant_limit_approval_scope CHECK ((scope_kind = 'chapter' AND requesting_unit_id IS NULL) OR (scope_kind = 'unit' AND requesting_unit_id IS NOT NULL)), ADD CONSTRAINT grant_limit_approval_amount CHECK (monetary_limit >= 0), ADD CONSTRAINT grant_limit_approval_interval CHECK (ends_at IS NULL OR ends_at > starts_at)");
        // Approval installation/revocation is restricted maintenance setup. The
        // HTTP runtime can read approval facts but cannot manufacture them.
        $runtime = DB::connection()->getPdo()->quote((string) config('database.runtime_username'));
        foreach (['INSERT', 'UPDATE', 'DELETE'] as $event) {
            DB::unprepared("CREATE TRIGGER duty_grant_limit_approvals_restricted_{$event} BEFORE {$event} ON duty_grant_limit_approvals FOR EACH ROW BEGIN IF SUBSTRING_INDEX(USER(), '@', 1) = {$runtime} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Limit approval requires restricted maintenance'; END IF; END");
        }
        DB::unprepared("CREATE TRIGGER duty_grant_limit_approvals_no_DELETE BEFORE DELETE ON duty_grant_limit_approvals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Limit approval history is retained'");
        DB::unprepared("CREATE TRIGGER duty_grant_limit_approvals_identity_UPDATE BEFORE UPDATE ON duty_grant_limit_approvals FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.chapter_id <=> OLD.chapter_id AND NEW.assigning_membership_id <=> OLD.assigning_membership_id AND NEW.role_id <=> OLD.role_id AND NEW.scope_kind <=> OLD.scope_kind AND NEW.requesting_unit_id <=> OLD.requesting_unit_id AND NEW.monetary_limit <=> OLD.monetary_limit AND NEW.starts_at <=> OLD.starts_at AND NEW.ends_at <=> OLD.ends_at AND NEW.approved_by_user_id <=> OLD.approved_by_user_id AND NEW.approval_reference <=> OLD.approval_reference AND NEW.approved_at <=> OLD.approved_at) OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Limit approval history is immutable'; END IF; END");
    }

    public function down(): void
    {
        Schema::dropIfExists('duty_grant_limit_approvals');
        Schema::table('chapter_operations', fn (Blueprint $table) => $table->dropColumn('input_snapshot'));
        DB::unprepared('DROP TRIGGER IF EXISTS duty_grants_no_DELETE');
        DB::unprepared('DROP TRIGGER IF EXISTS duty_grants_identity_UPDATE');
        DB::statement('ALTER TABLE duty_grants DROP CHECK duty_grant_row_version');
        Schema::table('duty_grants', function (Blueprint $table): void {
            $table->dropForeign(['authorized_by_user_id']);
            $table->dropColumn(['row_version', 'authorized_by_user_id', 'authorized_at']);
        });
    }
};
