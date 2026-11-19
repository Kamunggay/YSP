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
        Schema::create('actual_issues', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('requisition_id')->index();
            $table->string('issue_number');
            $table->string('status')->default('prepared'); // prepared, acknowledged, invalidated, posted
            $table->string('recipient_name');
            $table->string('prepared_by_user_id');
            $table->timestamp('actual_handover_at')->nullable();
            $table->uuid('evidence_binding_id')->nullable();
            $table->integer('material_version')->default(1);
            $table->timestamps();

            $table->index(['chapter_id', 'status']);
            $table->index(['chapter_id', 'requisition_id']);
        });

        Schema::create('actual_issue_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('actual_issue_id')->constrained('actual_issues')->cascadeOnDelete();
            $table->string('requisition_line_id');
            $table->string('variant_id');
            $table->string('unit_id');
            $table->string('lot_id')->nullable();
            $table->decimal('allocated_quantity', 12, 4);
            $table->decimal('issued_quantity', 12, 4);
            $table->timestamps();

            $table->index('actual_issue_id');
        });

        Schema::create('issue_reconciliations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('actual_issue_id')->constrained('actual_issues')->cascadeOnDelete();
            $table->string('officer_user_id');
            $table->string('finding'); // no_handover, handed_over_unposted, committed, disputed
            $table->text('notes')->nullable();
            $table->timestamp('reconciled_at');
            $table->timestamps();

            $table->index(['chapter_id', 'actual_issue_id']);
        });

        Schema::create('handovers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('handover_reference');
            $table->string('source_type'); // SALES_ORDER, REQUISITION, BOOTH_CHECKOUT, BOOTH_RETURN, ADJUSTMENT
            $table->string('source_id')->index();
            $table->string('recipient_name');
            $table->timestamp('actual_handover_at')->nullable();
            $table->string('handover_officer_id');
            $table->uuid('evidence_binding_id')->nullable();
            $table->string('status')->default('DRAFT'); // DRAFT, COMMITTED, DISPUTED
            $table->timestamps();

            $table->index(['chapter_id', 'source_type', 'source_id']);
        });

        Schema::create('handover_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('handover_id')->constrained('handovers')->cascadeOnDelete();
            $table->string('source_line_id');
            $table->string('variant_id');
            $table->string('unit_id');
            $table->decimal('actual_quantity', 12, 4);
            $table->string('inventory_movement_id')->nullable();
            $table->timestamps();

            $table->index('handover_id');
        });

        Schema::create('handover_receipts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('handover_id')->constrained('handovers')->cascadeOnDelete();
            $table->string('receipt_type'); // IS_AR, CUSTOMER_DR, BOOTH_CHECKOUT_RECEIPT
            $table->string('receipt_number');
            $table->timestamp('printed_at');
            $table->string('printed_by');
            $table->timestamps();

            $table->index('handover_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('handover_receipts');
        Schema::dropIfExists('handover_lines');
        Schema::dropIfExists('handovers');
        Schema::dropIfExists('issue_reconciliations');
        Schema::dropIfExists('actual_issue_lines');
        Schema::dropIfExists('actual_issues');
    }
};
