<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chapter_setup_entitlements', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('user_id')->constrained();
            $table->foreignUuid('chapter_id')->constrained();
            $table->string('procedure_id', 32);
            $table->dateTime('starts_at', 6);
            $table->dateTime('ends_at', 6)->nullable();
            $table->dateTime('revoked_at', 6)->nullable();
            $table->unique(['user_id', 'chapter_id', 'procedure_id'], 'chapter_setup_entitlement_scope');
        });

        Schema::create('account_onboarding_deliveries', function (Blueprint $table) {
            $table->char('reference_hash', 64)->primary();
            $table->uuid('target_id');
            $table->string('login', 254);
            $table->string('password_hash')->nullable();
            $table->dateTime('expires_at', 6);
        });

        Schema::create('chapter_organizational_units', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->dateTime('ended_at', 6)->nullable();
        });

        Schema::table('chapter_memberships', function (Blueprint $table) {
            $table->dateTime('effective_from', 6)->nullable();
        });

        Schema::table('duty_grants', function (Blueprint $table) {
            $table->dateTime('valid_from', 6)->nullable()->change();
            $table->dateTime('valid_until', 6)->nullable()->change();
        });

        Schema::table('policy_records', function (Blueprint $table) {
            $table->uuid('aggregate_id')->nullable();
            $table->unique(['aggregate_id', 'policy_version'], 'policy_aggregate_version');
            $table->dateTime('effective_from', 6)->nullable()->change();
            $table->dateTime('effective_until', 6)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('policy_records', function (Blueprint $table) {
            $table->dropUnique('policy_aggregate_version');
            $table->dropColumn('aggregate_id');
            $table->timestamp('effective_from')->nullable()->change();
            $table->timestamp('effective_until')->nullable()->change();
        });

        Schema::table('duty_grants', function (Blueprint $table) {
            $table->timestamp('valid_from')->nullable()->change();
            $table->timestamp('valid_until')->nullable()->change();
        });

        Schema::table('chapter_memberships', fn (Blueprint $table) => $table->dropColumn('effective_from'));
        Schema::dropIfExists('chapter_organizational_units');
        Schema::dropIfExists('account_onboarding_deliveries');
        Schema::dropIfExists('chapter_setup_entitlements');
    }
};
