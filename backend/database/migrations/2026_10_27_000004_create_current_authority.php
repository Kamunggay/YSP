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
        Schema::create('organizations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->string('name', 160);
        });
        Schema::create('chapters', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('code', 32)->unique();
            $table->string('name', 160);
            $table->enum('status', ['setup', 'live', 'suspended', 'archived'])->default('setup');
            $table->unsignedInteger('row_version')->default(1);
            $table->foreignId('provisioned_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('updated_at', 6)->useCurrent();
        });
        Schema::create('provider_role_grants', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('role_code', ['provisioner', 'billing_admin', 'recovery_operator']);
            $table->foreignId('granted_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('starts_at', 6);
            $table->timestamp('ends_at', 6)->nullable();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->text('reason');
            $table->index(['user_id', 'starts_at', 'ends_at']);
        });
        Schema::create('memberships', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('status', ['active', 'disabled', 'revoked'])->default('active');
            $table->unsignedInteger('authority_version')->default(1);
            $table->foreignId('authorized_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('authorized_at', 6);
            $table->timestamp('disabled_at', 6)->nullable();
            $table->unique(['chapter_id', 'user_id']);
            $table->unique(['chapter_id', 'id']);
            $table->index(['user_id', 'status']);
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->string('code', 40)->charset('ascii')->collation('ascii_bin')->unique();
        });
        $metadata = json_decode((string) file_get_contents(resource_path('contracts/session-runtime.json')), true, flags: JSON_THROW_ON_ERROR);
        foreach ($metadata['duties'] as $code) {
            DB::table('roles')->insert(['code' => $code]);
        }
        Schema::create('requesting_units', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->string('code', 32);
            $table->string('name', 160);
            $table->boolean('active')->default(true);
            $table->unique(['chapter_id', 'id']);
            $table->unique(['chapter_id', 'code']);
        });
        Schema::create('duty_grants', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('chapter_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('membership_id');
            $table->foreignId('role_id')->constrained()->restrictOnDelete();
            $table->enum('scope_kind', ['chapter', 'unit']);
            $table->unsignedBigInteger('requesting_unit_id')->nullable();
            $table->decimal('monetary_limit', 19, 2)->nullable();
            $table->timestamp('starts_at', 6);
            $table->timestamp('ends_at', 6)->nullable();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->foreign(['chapter_id', 'membership_id'])->references(['chapter_id', 'id'])->on('memberships')->restrictOnDelete();
            $table->foreign(['chapter_id', 'requesting_unit_id'])->references(['chapter_id', 'id'])->on('requesting_units')->restrictOnDelete();
            $table->index(['membership_id', 'starts_at', 'ends_at']);
        });
        foreach (['duty_grants', 'provider_role_grants'] as $table) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$table}_interval CHECK (ends_at IS NULL OR ends_at > starts_at)");
        }
        DB::statement("ALTER TABLE duty_grants ADD CONSTRAINT duty_grants_scope CHECK ((scope_kind = 'chapter' AND requesting_unit_id IS NULL) OR (scope_kind = 'unit' AND requesting_unit_id IS NOT NULL)), ADD CONSTRAINT duty_grants_limit CHECK (monetary_limit IS NULL OR monetary_limit >= 0)");
        DB::statement('ALTER TABLE memberships ADD CONSTRAINT memberships_version CHECK (authority_version BETWEEN 1 AND 2147483647)');
        DB::statement('ALTER TABLE chapters ADD CONSTRAINT chapters_version CHECK (row_version BETWEEN 1 AND 2147483647)');
    }

    public function down(): void
    {
        foreach (['duty_grants', 'requesting_units', 'roles', 'memberships', 'provider_role_grants', 'chapters', 'organizations'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
