<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('inventory_postings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('posting_reference')->index();
            $table->string('source_type'); // IPC, PO_DR, DA, RF_ISSUE, SO_DR, BOOTH_CHECKOUT, BOOTH_RETURN, ADJ
            $table->string('source_id')->index();
            $table->string('actor_id');
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['chapter_id', 'source_type', 'source_id']);
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('posting_id')->constrained('inventory_postings')->cascadeOnDelete();
            $table->string('chapter_id')->index();
            $table->string('variant_id')->index();
            $table->string('unit_id');
            $table->string('location_id');
            $table->string('condition'); // USABLE, QUARANTINE, REJECTED
            $table->decimal('quantity', 12, 4); // signed
            $table->decimal('balance_after', 12, 4);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['chapter_id', 'variant_id']);
        });

        Schema::create('inventory_lots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id', 64)->index();
            $table->string('variant_id', 64)->index();
            $table->string('unit_id', 64);
            $table->string('location_id', 64);
            $table->string('lot_code', 128)->default('DEFAULT');
            $table->string('condition', 32)->default('USABLE'); // USABLE, QUARANTINE, REJECTED
            $table->string('custody', 32)->default('STOCKROOM'); // STOCKROOM, BOOTH
            $table->string('custodian_user_id')->nullable();
            $table->decimal('quantity_on_hand', 12, 4)->default(0);
            $table->integer('quantity_scale')->default(0);
            $table->json('segments')->nullable();
            $table->integer('stock_version')->default(1);
            $table->string('historical_variant_label')->nullable();
            $table->integer('material_version')->default(1);
            $table->timestamps();

            $table->unique(
                ['chapter_id', 'variant_id', 'unit_id', 'location_id', 'condition', 'custody', 'lot_code'],
                'inv_lots_coordinate_unique'
            );
            $table->index(['chapter_id', 'condition', 'custody']);
        });

        Schema::create('lot_restriction_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('lot_id')->constrained('inventory_lots')->cascadeOnDelete();
            $table->string('policy_id')->nullable();
            $table->string('restriction_code', 64);
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lot_restriction_assignments');
        Schema::dropIfExists('inventory_lots');
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_postings');
    }
};
