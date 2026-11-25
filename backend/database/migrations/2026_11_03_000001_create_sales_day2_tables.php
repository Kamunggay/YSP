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
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->string('buyer_acceptance_status')->default('PENDING')->after('status');
        });

        Schema::create('customer_contact_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('so_id')->constrained('sales_orders')->cascadeOnDelete();
            $table->timestamp('contact_timestamp');
            $table->string('contact_method');
            $table->string('officer_id');
            $table->text('buyer_response');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('so_id');
        });

        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id');
            $table->string('source_type');
            $table->string('source_id');
            $table->string('source_line_id');
            $table->string('lot_id')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->string('status')->default('ACTIVE');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'source_type', 'source_id']);
            $table->index(['chapter_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
        Schema::dropIfExists('customer_contact_logs');

        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropColumn('buyer_acceptance_status');
        });
    }
};
