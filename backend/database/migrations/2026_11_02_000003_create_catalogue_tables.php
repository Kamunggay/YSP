<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalogue_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('code');
            $table->string('name')->nullable();
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->uuid('unit_id')->nullable();
            $table->json('settings')->nullable();
            $table->unsignedInteger('material_version')->default(1);
            $table->boolean('is_active')->default(true);
            $table->string('state')->default('active'); // active, retired
            $table->timestamps();

            $table->unique(['chapter_id', 'code']);
        });

        Schema::create('catalogue_variants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->uuid('item_id')->index();
            $table->string('sku')->nullable();
            $table->string('code')->nullable();
            $table->string('name')->nullable();
            $table->string('label')->nullable();
            $table->uuid('unit_id')->nullable();
            $table->integer('quantity_scale')->default(0);
            $table->boolean('quantity_identity_locked')->default(false);
            $table->longText('attributes_json')->nullable();
            $table->json('settings')->nullable();
            $table->unsignedInteger('material_version')->default(1);
            $table->boolean('is_active')->default(true);
            $table->string('state')->default('active');
            $table->timestamps();
        });

        Schema::create('catalogue_units', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('code');
            $table->string('name');
            $table->string('quantity_kind'); // piece, kit, measured
            $table->integer('quantity_scale')->default(0);
            $table->text('reason')->nullable();
            $table->boolean('quantity_identity_locked')->default(false);
            $table->string('state')->default('active'); // active, retired
            $table->unsignedInteger('material_version')->default(1);
            $table->timestamps();

            $table->unique(['chapter_id', 'code']);
        });

        Schema::create('catalogue_locations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('code');
            $table->string('name');
            $table->string('kind')->default('stockroom'); // stockroom, quarantine, booth
            $table->string('zone')->nullable();
            $table->string('shelf')->nullable();
            $table->uuid('custodian_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('state')->default('active');
            $table->unsignedInteger('material_version')->default(1);
            $table->timestamps();

            $table->unique(['chapter_id', 'code']);
        });

        Schema::create('catalogue_version_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('entity_type')->index();
            $table->uuid('entity_id')->index();
            $table->unsignedInteger('version');
            $table->longText('snapshot');
            $table->string('changed_by')->nullable();
            $table->timestamps();
        });

        Schema::create('catalogue_operations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('operation_key')->unique();
            $table->string('status');
            $table->longText('result')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalogue_operations');
        Schema::dropIfExists('catalogue_version_history');
        Schema::dropIfExists('catalogue_locations');
        Schema::dropIfExists('catalogue_units');
        Schema::dropIfExists('catalogue_variants');
        Schema::dropIfExists('catalogue_items');
    }
};
