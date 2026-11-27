<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chapter_organizational_units', function (Blueprint $table): void {
            $table->string('code', 80)->nullable();
            $table->string('name', 200)->nullable();
        });
        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->unique(['chapter_id', 'id'], 'inv_lots_chapter_identity_unique');
        });
        Schema::create('chapter_events', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->string('code', 80);
            $table->string('name', 200);
            $table->string('status', 32);
            $table->dateTime('starts_at', 6)->nullable();
            $table->dateTime('ends_at', 6)->nullable();
            $table->unique(['chapter_id', 'code']);
        });
        Schema::create('chapter_variant_procurement_guards', function (Blueprint $table): void {
            $table->uuid('chapter_id');
            $table->uuid('variant_id');
            $table->primary(['chapter_id', 'variant_id']);
        });
        Schema::create('repfs', function (Blueprint $table): void {
            $this->record($table, 'draft');
            $table->string('repf_reference', 80)->nullable();
            $table->uuid('prepared_by');
            $table->string('funding_source', 32)->default('chapter_budget');
            $table->string('urgency', 16)->default('normal');
            $table->text('justification')->nullable();
            $table->decimal('estimated_total_php', 14, 2)->default(0);
            $table->decimal('approved_budget_php', 14, 2)->nullable();
            $table->boolean('linked_demand_canceled')->default(false);
            $table->dateTime('linked_demand_canceled_at', 6)->nullable();
            $table->json('review_json')->nullable();
            $table->json('supplier_selection_json')->nullable();
            $table->unique(['chapter_id', 'repf_reference']);
            $table->unique(['chapter_id', 'id']);
        });
        Schema::create('repf_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('repf_id')->constrained();
            $table->unsignedInteger('line_number');
            $table->string('trigger_kind', 32);
            $table->uuid('item_id');
            $this->variant($table);
            $table->uuid('rf_id')->nullable()->index();
            $table->uuid('rf_line_id')->nullable()->index();
            $table->string('rf_reference', 80)->nullable();
            $table->unsignedInteger('rf_material_version')->nullable();
            $table->boolean('linked_demand_canceled')->default(false);
            $table->dateTime('linked_demand_canceled_at', 6)->nullable();
            $table->decimal('requested_quantity', 18, 6);
            $table->decimal('ordered_quantity', 18, 6)->default(0);
            $table->decimal('canceled_quantity', 18, 6)->default(0);
            $table->decimal('remaining_to_order_quantity', 18, 6);
            $table->decimal('estimated_unit_cost_php', 14, 2);
            $table->decimal('estimated_line_total_php', 14, 2);
            $table->date('needed_by')->nullable();
            $table->json('net_need_breakdown');
            $table->json('additional_purchase_reason')->nullable();
            $table->text('notes')->nullable();
            $table->unique(['repf_id', 'line_number']);
            $table->unique(['repf_id', 'id']);
            $table->index(['variant_id', 'repf_id']);
        });
        Schema::create('repf_quotations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->uuid('repf_id');
            $table->foreign(['chapter_id', 'repf_id'])->references(['chapter_id', 'id'])->on('repfs');
            $table->unsignedInteger('version')->default(1);
            $table->unsignedInteger('material_version')->default(1);
            $table->json('supplier');
            $table->json('lines');
            $table->json('terms_json');
            $table->decimal('total_amount_php', 14, 2);
            $table->boolean('is_selected')->default(false);
            $table->dateTime('selected_at', 6)->nullable();
            $table->json('waiver_json')->nullable();
            $table->json('evidence_binding')->nullable();
            $table->uuid('recorded_by');
            $table->timestamps(6);
            $table->unique(['repf_id', 'id']);
        });
        Schema::create('purchase_orders', function (Blueprint $table): void {
            $this->record($table, 'draft');
            $table->uuid('repf_id');
            $table->foreign(['chapter_id', 'repf_id'])->references(['chapter_id', 'id'])->on('repfs');
            $table->uuid('supplier_selection_id');
            $table->uuid('selected_quotation_id')->nullable();
            $table->foreign(['repf_id', 'selected_quotation_id'])->references(['repf_id', 'id'])->on('repf_quotations');
            $table->string('po_reference', 80)->nullable();
            $table->uuid('prepared_by');
            $table->json('supplier');
            $table->string('delivery_location', 300);
            $table->date('expected_delivery_date');
            $table->date('revised_expected_delivery_date')->nullable();
            $table->text('payment_and_delivery_terms');
            $table->decimal('total_amount_php', 14, 2);
            $table->boolean('emergency_waiver_used')->default(false);
            $table->boolean('linked_demand_canceled')->default(false);
            $table->dateTime('linked_demand_canceled_at', 6)->nullable();
            $table->dateTime('issued_at', 6)->nullable();
            $table->json('review_json')->nullable();
            $table->json('acknowledgment')->nullable();
            $table->unique(['chapter_id', 'po_reference']);
            $table->unique(['chapter_id', 'id']);
            $table->unique(['repf_id', 'id']);
        });
        Schema::create('purchase_order_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('po_id');
            $table->uuid('repf_id');
            $table->uuid('repf_line_id');
            $table->foreign(['repf_id', 'po_id'])->references(['repf_id', 'id'])->on('purchase_orders');
            $table->foreign(['repf_id', 'repf_line_id'])->references(['repf_id', 'id'])->on('repf_lines');
            $table->uuid('quotation_line_id')->nullable();
            $this->variant($table);
            $table->decimal('ordered_quantity', 18, 6);
            $table->decimal('accepted_quantity', 18, 6)->default(0);
            $table->decimal('rejected_or_disputed_quantity', 18, 6)->default(0);
            $table->decimal('closed_short_quantity', 18, 6)->default(0);
            $table->decimal('canceled_quantity', 18, 6)->default(0);
            $table->decimal('outstanding_quantity', 18, 6);
            $table->decimal('unit_price_php', 14, 2);
            $table->decimal('line_total_php', 14, 2);
            $table->text('specifications')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('linked_demand_canceled')->default(false);
            $table->dateTime('linked_demand_canceled_at', 6)->nullable();
            $table->index(['variant_id', 'po_id']);
        });
        Schema::create('purchase_order_amendments', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->uuid('po_id');
            $table->foreign(['chapter_id', 'po_id'])->references(['chapter_id', 'id'])->on('purchase_orders');
            $table->unsignedInteger('amendment_number');
            $table->enum('status', ['pending_approval', 'approved'])->default('pending_approval');
            $table->uuid('pending_po_id')->nullable()->virtualAs("CASE WHEN status = 'pending_approval' THEN po_id END");
            $table->unsignedInteger('base_material_version');
            $table->unsignedInteger('applied_material_version')->nullable();
            $table->string('delivery_location', 300)->nullable();
            $table->date('expected_delivery_date')->nullable();
            $table->text('payment_and_delivery_terms')->nullable();
            $table->decimal('proposed_total_php', 14, 2);
            $table->text('reason');
            $table->json('lines');
            $table->uuid('proposed_by');
            $table->dateTime('proposed_at', 6);
            $table->uuid('approved_by')->nullable();
            $table->dateTime('approved_at', 6)->nullable();
            $table->unique('pending_po_id', 'po_amendment_one_pending');
            $table->unique(['po_id', 'amendment_number'], 'po_amendment_order_number_unique');
        });
        Schema::create('donations', function (Blueprint $table): void {
            $this->record($table, 'draft');
            $table->string('reference', 80)->nullable();
            $table->uuid('prepared_by');
            $table->string('donor_name', 200);
            $table->uuid('valuation_policy_id');
            $table->unsignedInteger('valuation_policy_version');
            $table->json('valuation_policy');
            $table->decimal('pledged_total_value_php', 14, 2);
            $table->json('acknowledgment')->nullable();
            $table->unique(['chapter_id', 'reference']);
            $table->unique(['chapter_id', 'id']);
        });
        Schema::create('donation_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('da_id')->constrained('donations');
            $table->unsignedInteger('line_number');
            $this->variant($table);
            $table->decimal('pledged_quantity', 18, 6);
            $table->decimal('received_quantity', 18, 6)->default(0);
            $table->decimal('closed_short_quantity', 18, 6)->default(0);
            $table->decimal('outstanding_quantity', 18, 6);
            $table->decimal('unit_value_php', 14, 2);
            $table->decimal('pledged_value_php', 14, 2);
            $table->string('valuation_kind', 16);
            $table->string('valuation_basis', 200);
            $table->text('condition_notes')->nullable();
            $table->json('initial_restrictions');
            $table->json('restrictions');
            $table->unique(['da_id', 'line_number']);
            $table->unique(['da_id', 'id']);
        });
        Schema::create('donation_restriction_resolutions', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->uuid('da_id');
            $table->uuid('da_line_id');
            $table->foreign(['chapter_id', 'da_id'])->references(['chapter_id', 'id'])->on('donations');
            $table->foreign(['da_id', 'da_line_id'])->references(['da_id', 'id'])->on('donation_lines');
            $table->enum('resolution_kind', ['apply', 'audit_review']);
            $table->json('previous_restrictions');
            $table->json('restrictions');
            $table->json('updated_lot_ids');
            $table->json('binding');
            $table->json('snapshot');
            $table->uuid('actor_id');
            $table->text('reason');
            $table->dateTime('signed_at', 6);
            $table->dateTime('committed_at', 6);
        });
        Schema::create('receiving_holds', function (Blueprint $table): void {
            $this->record($table, 'held');
            $table->dateTime('arrived_at', 6);
            $table->uuid('holding_location_id');
            $table->string('carrier_or_sender_name', 200);
            $table->string('sender_kind', 16);
            $table->string('delivery_document_reference', 80)->nullable();
            $table->text('hold_reason');
            $table->json('items');
            $table->uuid('recorded_by');
            $table->enum('source_kind', ['po', 'da'])->nullable();
            $table->uuid('source_id')->nullable();
            $table->json('intake_evidence')->nullable();
            $table->json('linked_source')->nullable();
            $table->json('rejection_return')->nullable();
            $table->boolean('usable_stock_posted')->default(false);
            $table->boolean('ipc_creation_prohibited')->default(true);
            $table->unique(['chapter_id', 'id']);
        });
        Schema::create('receiving_reports', function (Blueprint $table): void {
            $this->record($table, 'draft');
            $table->string('rm_reference', 80)->nullable();
            $table->enum('source_kind', ['po', 'da']);
            $table->uuid('source_id');
            $table->string('source_reference', 80);
            $table->unsignedInteger('source_material_version');
            $table->uuid('originating_hold_id')->nullable();
            $table->foreign(['chapter_id', 'originating_hold_id'])->references(['chapter_id', 'id'])->on('receiving_holds');
            $table->uuid('resolves_discrepancy_id')->nullable();
            $table->uuid('location_id');
            $table->uuid('prepared_by');
            $table->string('supplier_dr_reference', 80)->nullable();
            $table->date('supplier_dr_date')->nullable();
            $table->decimal('accepted_total_value_php', 14, 2)->nullable();
            $table->json('inspection')->nullable();
            $table->char('snapshot_sha256', 64)->nullable();
            $table->json('evidence_acknowledgment')->nullable();
            $table->uuid('posted_by')->nullable();
            $table->dateTime('posted_at', 6)->nullable();
            $table->unsignedInteger('posting_stock_version')->nullable();
            $table->json('cancellation_json')->nullable();
            $table->unique(['chapter_id', 'rm_reference']);
            $table->unique(['chapter_id', 'id']);
            $table->index(['chapter_id', 'source_kind', 'source_id'], 'receiving_source_idx');
        });
        Schema::create('receiving_report_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('rm_id')->constrained('receiving_reports');
            $table->uuid('source_line_id');
            $table->unsignedInteger('line_number');
            $this->variant($table);
            $table->decimal('delivered_quantity', 18, 6);
            $table->decimal('accepted_quantity', 18, 6)->nullable();
            $table->decimal('damaged_quantity', 18, 6)->nullable();
            $table->decimal('rejected_quantity', 18, 6)->nullable();
            $table->decimal('unit_valuation_php', 14, 2)->nullable();
            $table->decimal('accepted_value_php', 14, 2)->nullable();
            $table->json('restrictions')->nullable();
            $table->text('discrepancy_notes')->nullable();
            $table->uuid('resolves_discrepancy_id')->nullable();
            $table->unique(['rm_id', 'line_number']);
            $table->unique(['rm_id', 'id']);
        });
        Schema::create('receiving_discrepancies', function (Blueprint $table): void {
            $this->record($table, 'open');
            $table->enum('source_kind', ['po', 'da']);
            $table->uuid('source_id');
            $table->uuid('source_line_id');
            $table->uuid('rm_id');
            $table->uuid('rm_line_id');
            $table->foreign(['chapter_id', 'rm_id'])->references(['chapter_id', 'id'])->on('receiving_reports');
            $table->foreign(['rm_id', 'rm_line_id'])->references(['rm_id', 'id'])->on('receiving_report_lines');
            $this->variant($table);
            $table->decimal('damaged_quantity', 18, 6);
            $table->decimal('rejected_quantity', 18, 6);
            $table->uuid('quarantined_lot_id')->nullable();
            $table->uuid('rejected_lot_id')->nullable();
            $table->foreign(['chapter_id', 'quarantined_lot_id'])->references(['chapter_id', 'id'])->on('inventory_lots');
            $table->foreign(['chapter_id', 'rejected_lot_id'])->references(['chapter_id', 'id'])->on('inventory_lots');
            $table->text('discrepancy_notes');
            $table->json('supplier_notification')->nullable();
            $table->json('review_json')->nullable();
            $table->json('resolution')->nullable();
            $table->uuid('replacement_rm_id')->nullable();
            $table->foreign(['chapter_id', 'replacement_rm_id'])->references(['chapter_id', 'id'])->on('receiving_reports');
            $table->boolean('quarantined_lots_auto_cleared_on_source_close')->default(false);
            $table->index(['chapter_id', 'source_kind', 'source_id'], 'discrepancies_source_idx');
        });
        Schema::create('stage2_record_histories', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('chapter_id')->constrained();
            $table->string('record_kind', 40);
            $table->uuid('record_id');
            $table->unsignedInteger('sequence_no');
            $table->unsignedInteger('version');
            $table->unsignedInteger('material_version');
            $table->boolean('is_version_snapshot');
            $table->string('event_type', 80);
            $table->uuid('actor_user_id');
            $table->text('reason')->nullable();
            $table->json('snapshot_json');
            $table->json('operation_json')->nullable();
            $table->dateTime('recorded_at', 6);
            $table->unique(['chapter_id', 'record_kind', 'record_id', 'sequence_no'], 's2_history_sequence_unique');
            $table->index(['chapter_id', 'record_kind', 'record_id', 'version', 'is_version_snapshot'], 's2_history_snapshot_idx');
            $table->index(['chapter_id', 'recorded_at', 'id'], 's2_history_audit_idx');
        });
    }

    public function down(): void
    {
        foreach ([
            'stage2_record_histories', 'receiving_discrepancies', 'receiving_report_lines', 'receiving_reports',
            'receiving_holds', 'donation_restriction_resolutions', 'donation_lines', 'donations',
            'purchase_order_amendments', 'purchase_order_lines', 'purchase_orders', 'repf_quotations', 'repf_lines',
            'repfs', 'chapter_variant_procurement_guards', 'chapter_events',
        ] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->dropUnique('inv_lots_chapter_identity_unique');
        });
        Schema::table('chapter_organizational_units', function (Blueprint $table): void {
            $table->dropColumn(['code', 'name']);
        });
    }

    private function record(Blueprint $table, string $initialStatus): void
    {
        $table->uuid('id')->primary();
        $table->foreignUuid('chapter_id')->constrained();
        $table->string('status', 32)->default($initialStatus);
        $table->unsignedInteger('version')->default(1);
        $table->unsignedInteger('material_version')->default(1);
        $table->timestamps(6);
        $table->index(['chapter_id', 'status', 'id']);
    }

    private function variant(Blueprint $table): void
    {
        $table->uuid('variant_id');
        $table->uuid('unit_id');
        $table->unsignedTinyInteger('quantity_scale');
    }
};
