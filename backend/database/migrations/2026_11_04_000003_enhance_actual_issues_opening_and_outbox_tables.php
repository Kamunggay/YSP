<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_lots', function (Blueprint $table) {
            $table->string('basis_segment_id')->nullable()->index('inv_lots_basis_seg_idx');
            $table->decimal('original_quantity', 18, 6)->nullable();
            $table->string('source_type')->nullable();
            $table->string('source_id')->nullable();
            $table->string('source_reference')->nullable();
        });

        Schema::table('actual_issues', function (Blueprint $table) {
            $table->unsignedInteger('version')->default(1);
            $table->string('recipient_user_id')->nullable();
            $table->timestamp('handed_over_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('entered_at')->nullable();
            $table->timestamp('matched_at')->nullable();
            $table->string('matched_by_user_id')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->string('posted_by_user_id')->nullable();
            $table->boolean('recipient_accepts_partial')->default(false);
            $table->string('handover_fence')->default('none'); // none|unresolved|retry_authorized|committed|disputed
            $table->json('material_json')->nullable();
            $table->string('material_sha256', 64)->nullable();
            $table->string('inventory_posting_id')->nullable();
            $table->timestamp('printed_at')->nullable();
        });

        Schema::table('actual_issue_lines', function (Blueprint $table) {
            $table->string('reservation_id')->nullable()->index('ail_reservation_idx');
            $table->string('basis_segment_id')->nullable();
            $table->decimal('offset_quantity', 18, 6)->default(0);
            $table->string('inventory_movement_id')->nullable();
        });

        Schema::create('actual_issue_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->foreignUuid('actual_issue_id')->constrained('actual_issues')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->unsignedInteger('material_version');
            $table->string('event_type');
            $table->string('actor_user_id')->nullable();
            $table->text('reason')->nullable();
            $table->json('snapshot_json');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['actual_issue_id', 'version'], 'actual_issue_hist_ver_idx');
        });

        Schema::create('opening_record_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('record_type'); // IPC|OPENING_RM
            $table->string('record_id')->index();
            $table->unsignedInteger('revision');
            $table->unsignedInteger('material_version');
            $table->string('event_type');
            $table->string('actor_user_id')->nullable();
            $table->json('snapshot_json');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['record_type', 'record_id', 'revision'], 'open_rec_hist_type_id_rev_idx');
        });

        Schema::create('domain_notification_outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->nullable()->index();
            $table->string('event_name')->index();
            $table->string('channel_name');
            $table->string('target_user_id')->nullable()->index();
            $table->string('resource_id')->index();
            $table->unsignedInteger('resource_version')->nullable();
            $table->unsignedInteger('material_version')->nullable();
            $table->timestamp('committed_at', 6);
            $table->json('payload_json');
            $table->string('status')->default('pending'); // pending|dispatched|failed
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['status', 'created_at'], 'outbox_status_created_idx');
        });

        Schema::table('idempotency_records', function (Blueprint $table) {
            $table->string('operation_name', 128)->nullable()->index('idemp_op_name_idx');
            $table->string('resource_id')->nullable();
            $table->string('state')->default('committed');

            $table->index(['chapter_id', 'operation_name', 'key'], 'idemp_chapter_op_key_idx');
        });

        Schema::table('evidence_bindings', function (Blueprint $table) {
            $table->string('status')->default('active')->index('ev_bindings_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('evidence_bindings', function (Blueprint $table) {
            $table->dropIndex('ev_bindings_status_idx');
            $table->dropColumn('status');
        });

        Schema::table('idempotency_records', function (Blueprint $table) {
            $table->dropIndex('idemp_chapter_op_key_idx');
            $table->dropIndex('idemp_op_name_idx');
            $table->dropColumn(['operation_name', 'resource_id', 'state']);
        });

        Schema::dropIfExists('domain_notification_outbox');
        Schema::dropIfExists('opening_record_history');
        Schema::dropIfExists('actual_issue_history');

        Schema::table('actual_issue_lines', function (Blueprint $table) {
            $table->dropIndex('ail_reservation_idx');
            $table->dropColumn(['reservation_id', 'basis_segment_id', 'offset_quantity', 'inventory_movement_id']);
        });

        Schema::table('actual_issues', function (Blueprint $table) {
            $table->dropColumn([
                'version',
                'recipient_user_id',
                'handed_over_at',
                'acknowledged_at',
                'entered_at',
                'matched_at',
                'matched_by_user_id',
                'posted_at',
                'posted_by_user_id',
                'recipient_accepts_partial',
                'handover_fence',
                'material_json',
                'material_sha256',
                'inventory_posting_id',
                'printed_at',
            ]);
        });

        Schema::table('inventory_lots', function (Blueprint $table) {
            $table->dropIndex('inv_lots_basis_seg_idx');
            $table->dropColumn(['basis_segment_id', 'original_quantity', 'source_type', 'source_id', 'source_reference']);
        });
    }
};
