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
        Schema::create('buyers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id');
            $table->string('name');
            $table->string('organization_name')->nullable();
            $table->string('contact_person')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'name']);
        });

        Schema::create('sales_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id');
            $table->string('so_number')->unique();
            $table->foreignUuid('buyer_id')->constrained('buyers')->cascadeOnDelete();
            $table->date('order_date');
            $table->date('target_delivery_date');
            $table->string('status')->default('DRAFT');
            $table->text('rejection_reason')->nullable();
            $table->text('terms_conditions')->nullable();
            $table->unsignedInteger('terms_version')->default(1);
            $table->unsignedInteger('version')->default(1);
            $table->string('created_by');
            $table->string('approved_by')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'status']);
            $table->index(['chapter_id', 'buyer_id']);
        });

        Schema::create('sales_order_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('so_id')->constrained('sales_orders')->cascadeOnDelete();
            $table->string('variant_id');
            $table->string('unit_id');
            $table->decimal('ordered_quantity', 12, 2);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('line_total', 12, 2);
            $table->decimal('reserved_quantity', 12, 2)->default(0);
            $table->decimal('backordered_quantity', 12, 2)->default(0);
            $table->decimal('delivered_quantity', 12, 2)->default(0);
            $table->string('line_status')->default('ACTIVE');
            $table->unsignedInteger('material_version')->default(1);
            $table->timestamps();

            $table->index('so_id');
        });

        Schema::create('sales_order_revisions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('so_id')->constrained('sales_orders')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->json('snapshot');
            $table->text('reason')->nullable();
            $table->string('created_by');
            $table->timestamps();

            $table->index(['so_id', 'version']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sales_order_revisions');
        Schema::dropIfExists('sales_order_lines');
        Schema::dropIfExists('sales_orders');
        Schema::dropIfExists('buyers');
    }
};
