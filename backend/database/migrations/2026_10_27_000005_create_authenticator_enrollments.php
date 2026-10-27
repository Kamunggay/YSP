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
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('mfa_last_used_step')->nullable();
        });
        Schema::create('authenticator_enrollments', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->foreignId('user_id')->primary()->constrained()->restrictOnDelete();
            $table->string('enrollment_id', 100)->charset('ascii')->collation('ascii_bin')->unique();
            $table->char('session_binding', 64)->charset('ascii')->collation('ascii_bin');
            $table->unsignedInteger('auth_version');
            $table->text('secret_ciphertext')->nullable();
            $table->timestamp('created_at', 6);
            $table->timestamp('expires_at', 6);
            $table->unsignedTinyInteger('failed_attempts')->default(0);
            $table->timestamp('attempt_window_expires_at', 6);
            $table->timestamp('consumed_at', 6)->nullable();
        });
        DB::statement('ALTER TABLE authenticator_enrollments ADD CONSTRAINT enrollment_attempt_cap CHECK (failed_attempts <= 5)');
        DB::statement('ALTER TABLE authenticator_enrollments ADD CONSTRAINT enrollment_ten_minutes CHECK (expires_at = created_at + INTERVAL 10 MINUTE)');
        Schema::create('user_recovery_codes', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->binary('code_hash', 32, fixed: true);
            $table->timestamp('issued_at', 6);
            $table->timestamp('used_at', 6)->nullable();
            $table->unique(['user_id', 'code_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_recovery_codes');
        Schema::dropIfExists('authenticator_enrollments');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('mfa_last_used_step'));
    }
};
