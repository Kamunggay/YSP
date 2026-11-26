<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('browser_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->char('token_hash', 64)->unique();
            $table->char('csrf_token', 64);
            $table->foreignUuid('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('user_version')->nullable();
            $table->string('next_step')->nullable();
            $table->dateTime('authenticated_at')->nullable();
            $table->dateTime('expires_at')->index();
            $table->json('sign_in_receipt')->nullable();
        });

        Schema::create('provider_role_grants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained();
            $table->string('role_code', 32);
            $table->foreignUuid('granted_by_user_id')->constrained('users');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->dateTime('revoked_at')->nullable();
            $table->text('reason');
            $table->index(['user_id', 'role_code', 'starts_at', 'ends_at']);
        });

        Schema::create('cache', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->mediumText('value');
            $table->integer('expiration')->index();
        });

        Schema::create('cache_locks', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->string('owner');
            $table->integer('expiration')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cache_locks');
        Schema::dropIfExists('cache');
        Schema::dropIfExists('provider_role_grants');
        Schema::dropIfExists('browser_sessions');
    }
};
