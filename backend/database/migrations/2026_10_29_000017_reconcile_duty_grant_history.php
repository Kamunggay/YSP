<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE duty_grants MODIFY starts_at DATETIME(6) NOT NULL, MODIFY ends_at DATETIME(6) NULL, MODIFY revoked_at DATETIME(6) NULL, MODIFY authorized_at DATETIME(6) NULL');
        DB::statement('ALTER TABLE duty_grant_limit_approvals MODIFY starts_at DATETIME(6) NOT NULL, MODIFY ends_at DATETIME(6) NULL, MODIFY revoked_at DATETIME(6) NULL, MODIFY approved_at DATETIME(6) NOT NULL');
        // Existing bootstrap history is the source of truth for pre-attribution grants.
        DB::unprepared('DROP TRIGGER duty_grants_identity_UPDATE');
        try {
            DB::statement('UPDATE duty_grants AS g JOIN initial_head_bootstraps AS b ON b.duty_grant_id = g.id AND b.chapter_id = g.chapter_id SET g.authorized_by_user_id = COALESCE(g.authorized_by_user_id, b.approved_by_user_id), g.authorized_at = COALESCE(g.authorized_at, b.installed_at) WHERE g.authorized_by_user_id IS NULL OR g.authorized_at IS NULL');
        } finally {
            DB::unprepared("CREATE TRIGGER duty_grants_identity_UPDATE BEFORE UPDATE ON duty_grants FOR EACH ROW BEGIN IF NOT (NEW.id <=> OLD.id AND NEW.chapter_id <=> OLD.chapter_id AND NEW.membership_id <=> OLD.membership_id AND NEW.role_id <=> OLD.role_id AND NEW.scope_kind <=> OLD.scope_kind AND NEW.requesting_unit_id <=> OLD.requesting_unit_id AND NEW.authorized_by_user_id <=> OLD.authorized_by_user_id AND NEW.authorized_at <=> OLD.authorized_at) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Grant identity and attribution are immutable'; END IF; END");
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Recovered grant history and wider valid instants cannot be rolled back.');
    }
};
