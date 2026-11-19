<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rf_reservation_preparations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('rf_id')->constrained('internal_rfs')->cascadeOnDelete();
            $table->foreignUuid('rf_line_id')->constrained('internal_rf_lines')->cascadeOnDelete();
            $table->string('actor_user_id')->index();
            $table->string('status')->default('prepared'); // prepared|committed
            $table->unsignedInteger('version')->default(1);
            $table->unsignedInteger('expected_rf_version');
            $table->unsignedInteger('expected_rf_material_version');
            $table->unsignedInteger('expected_rf_progress_version');
            $table->json('targets_json');
            $table->json('advisory_review_json')->nullable();
            $table->string('override_policy_id')->nullable();
            $table->string('committed_reservation_id')->nullable();
            $table->timestamp('observed_at')->useCurrent();
            $table->timestamps();

            $table->unique('committed_reservation_id', 'prep_committed_res_unique');
        });

        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->string('rf_line_id')->nullable()->index('res_rf_line_idx');
            $table->string('preparation_id')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->unsignedInteger('material_version')->default(1);
            $table->decimal('committed_quantity', 18, 6)->nullable();
            $table->decimal('active_quantity', 18, 6)->nullable();
            $table->decimal('fulfilled_quantity', 18, 6)->default(0);
            $table->decimal('released_quantity', 18, 6)->default(0);
            $table->decimal('blocked_quantity', 18, 6)->default(0);
            $table->string('state')->default('active');
            $table->string('created_by_user_id')->nullable();

            $table->unique('preparation_id', 'res_preparation_unique');
        });

        Schema::create('rf_reservation_allocations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('reservation_id')->constrained('stock_reservations')->cascadeOnDelete();
            $table->string('lot_id')->index();
            $table->string('basis_segment_id')->index();
            $table->decimal('offset_quantity', 18, 6);
            $table->decimal('quantity', 18, 6);
            $table->decimal('consumed_quantity', 18, 6)->default(0);
            $table->decimal('released_quantity', 18, 6)->default(0);
            $table->string('status')->default('active'); // active|consumed|released|reallocated
            $table->timestamps();

            $table->index(['chapter_id', 'lot_id', 'status'], 'rf_res_alloc_lot_status_idx');
        });

        Schema::create('rf_reservation_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('reservation_id')->constrained('stock_reservations')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('material_version');
            $table->string('event_type');
            $table->string('actor_user_id')->nullable();
            $table->text('reason')->nullable();
            $table->json('snapshot_json');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['reservation_id', 'version'], 'rf_res_hist_ver_idx');
        });

        Schema::create('stock_holds', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('status')->default('active'); // active|cleared
            $table->unsignedInteger('version')->default(1);
            $table->unsignedInteger('material_version')->default(1);
            $table->string('reason_code');
            $table->text('reason');
            $table->string('placed_by_user_id');
            $table->timestamp('placed_at')->useCurrent();
            $table->json('clearance_proposal_json')->nullable();
            $table->string('clearance_material_sha256', 64)->nullable();
            $table->string('clearance_prepared_by_user_id')->nullable();
            $table->string('clearance_evidence_binding_id')->nullable();
            $table->json('clearance_acknowledgment_json')->nullable();
            $table->string('cleared_by_user_id')->nullable();
            $table->timestamp('cleared_at')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'status'], 'stock_holds_chap_status_idx');
        });

        Schema::create('stock_hold_ranges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('hold_id')->constrained('stock_holds')->cascadeOnDelete();
            $table->string('lot_id')->index();
            $table->string('basis_segment_id')->index();
            $table->decimal('offset_quantity', 18, 6);
            $table->decimal('quantity', 18, 6);
            $table->timestamps();

            $table->index(['chapter_id', 'lot_id'], 'stock_hold_ranges_chap_lot_idx');
        });

        Schema::create('stock_hold_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('hold_id')->constrained('stock_holds')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('material_version');
            $table->string('event_type');
            $table->string('actor_user_id')->nullable();
            $table->json('snapshot_json');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['hold_id', 'version'], 'stock_hold_hist_ver_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_hold_history');
        Schema::dropIfExists('stock_hold_ranges');
        Schema::dropIfExists('stock_holds');
        Schema::dropIfExists('rf_reservation_history');
        Schema::dropIfExists('rf_reservation_allocations');

        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->dropUnique('res_preparation_unique');
            $table->dropIndex('res_rf_line_idx');
            $table->dropColumn([
                'rf_line_id',
                'preparation_id',
                'version',
                'material_version',
                'committed_quantity',
                'active_quantity',
                'fulfilled_quantity',
                'released_quantity',
                'blocked_quantity',
                'state',
                'created_by_user_id',
            ]);
        });

        Schema::dropIfExists('rf_reservation_preparations');
    }
};
