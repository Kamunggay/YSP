<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chapters', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('status')->default('setup'); // setup, live, suspended, retired
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('public_id')->unique();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->string('status')->default('active'); // active, suspended, invited, enabled, disabled
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('chapter_memberships', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->uuid('user_id');
            $table->string('membership_status')->default('active'); // active, suspended
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();

            $table->index(['chapter_id', 'user_id']);
        });

        Schema::create('duty_grants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->uuid('user_id');
            $table->string('duty_code'); // SALES_OFFICER, SALES_REVIEWER, INVENTORY_CUSTODIAN, INVENTORY_REVIEWER, etc.
            $table->string('status')->default('active'); // active, revoked
            $table->boolean('is_alternate')->default(false);
            $table->uuid('replaces_user_id')->nullable();
            $table->json('scope')->nullable();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();

            $table->index(['chapter_id', 'user_id', 'duty_code']);
        });

        Schema::create('user_mfa_credentials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('secret');
            $table->boolean('is_confirmed')->default(false);
            $table->json('recovery_codes')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();

            $table->index('user_id');
        });

        Schema::create('policy_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id')->nullable();
            $table->string('policy_code');
            $table->unsignedInteger('policy_version')->default(1);
            $table->json('rules_json');
            $table->timestamp('effective_from')->nullable();
            $table->timestamp('effective_until')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'policy_code']);
        });

        Schema::create('idempotency_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('key')->index();
            $table->string('chapter_id')->nullable()->index();
            $table->string('user_id')->nullable()->index();
            $table->string('payload_hash');
            $table->integer('response_code');
            $table->longText('response_body');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->nullable()->index();
            $table->string('user_id')->nullable()->index();
            $table->string('action');
            $table->string('entity_type');
            $table->string('entity_id');
            $table->longText('details')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('idempotency_records');
        Schema::dropIfExists('policy_records');
        Schema::dropIfExists('user_mfa_credentials');
        Schema::dropIfExists('duty_grants');
        Schema::dropIfExists('chapter_memberships');
        Schema::dropIfExists('users');
        Schema::dropIfExists('chapters');
    }
};
