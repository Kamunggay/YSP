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
        Schema::create('users', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->char('public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $table->string('name', 160);
            $table->string('email', 254);
            $table->binary('email_key', 254)->unique();
            $table->binary('password_hash', 255);
            $table->enum('status', ['active', 'disabled'])->default('active');
            $table->unsignedInteger('auth_version')->default(1);
            $table->binary('mfa_secret_ciphertext')->nullable();
            $table->timestamp('mfa_confirmed_at', 6)->nullable();
            $table->timestamp('disabled_at', 6)->nullable();
            $table->timestamps(6);
        });
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_auth_version CHECK (auth_version BETWEEN 1 AND 2147483647)');
        Schema::table('sessions', function (Blueprint $table): void {
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
        });
        Schema::create('global_security_events', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('event_code', 48);
            $table->string('operator_reference', 160);
            $table->timestamp('occurred_at', 6);
            $table->json('details');
            $table->index(['user_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('global_security_events');
        Schema::table('sessions', fn (Blueprint $table) => $table->dropForeign(['user_id']));
        Schema::dropIfExists('users');
    }
};
