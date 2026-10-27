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
        Schema::table('provider_role_grants', function (Blueprint $table): void {
            $table->unsignedInteger('authority_version')->default(1);
        });
        DB::statement('ALTER TABLE provider_role_grants ADD CONSTRAINT provider_authority_version CHECK (authority_version BETWEEN 1 AND 2147483647)');
        Schema::create('initial_provider_installations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('organization_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('provider_user_id')->unique()->constrained('users')->restrictOnDelete();
            $table->foreignId('provider_role_grant_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('approved_by_user_id')->constrained('users')->restrictOnDelete();
            $table->string('operator_reference', 160);
            $table->string('approval_reference', 500);
            $table->timestamp('installed_at', 6);
        });
        DB::statement('ALTER TABLE initial_provider_installations ADD CONSTRAINT independent_provider_approval CHECK (approved_by_user_id <> provider_user_id)');
        foreach (['UPDATE', 'DELETE'] as $event) {
            DB::unprepared("CREATE TRIGGER initial_provider_installations_no_{$event} BEFORE {$event} ON initial_provider_installations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Provider installation history is immutable'");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('initial_provider_installations');
        DB::statement('ALTER TABLE provider_role_grants DROP CHECK provider_authority_version');
        Schema::table('provider_role_grants', fn (Blueprint $table) => $table->dropColumn('authority_version'));
    }
};
