<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('browser_sessions', function (Blueprint $table) {
            $table->string('authentication_method', 16)->default('password');
        });

        Schema::table('user_mfa_credentials', function (Blueprint $table) {
            $table->text('encrypted_seed')->nullable();
            $table->uuid('enrollment_id')->nullable();
            $table->uuid('pending_browser_session_id')->nullable()->index();
            $table->dateTime('pending_expires_at')->nullable()->index();
            $table->json('accepted_totp_steps')->nullable();
            $table->uuid('recovery_set_id')->nullable();
            $table->dateTime('recovery_set_created_at')->nullable();
        });

        // The old implementation issued placeholder seeds and fixed plaintext recovery codes.
        DB::table('user_mfa_credentials')->update(['secret' => '', 'recovery_codes' => null]);

        Schema::create('browser_mfa_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('browser_session_id')->constrained()->cascadeOnDelete();
            $table->string('operation', 32);
            $table->uuid('action_key');
            $table->char('fingerprint', 64);
            $table->json('result')->nullable();
            $table->uuid('recovery_set_id')->nullable()->index();
            $table->text('delivery')->nullable();
            $table->dateTime('delivery_expires_at')->nullable()->index();
            $table->unique(['browser_session_id', 'operation', 'action_key'], 'browser_mfa_receipts_intent_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('browser_mfa_receipts');

        Schema::table('user_mfa_credentials', function (Blueprint $table) {
            $table->dropIndex(['pending_browser_session_id']);
            $table->dropIndex(['pending_expires_at']);
            $table->dropColumn([
                'encrypted_seed', 'enrollment_id', 'pending_browser_session_id', 'pending_expires_at',
                'accepted_totp_steps', 'recovery_set_id', 'recovery_set_created_at',
            ]);
        });

        Schema::table('browser_sessions', fn (Blueprint $table) => $table->dropColumn('authentication_method'));
    }
};
