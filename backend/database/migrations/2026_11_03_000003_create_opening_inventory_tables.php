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
        Schema::create('opening_counts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('ipc_number')->nullable()->index();
            $table->string('status')->default('DRAFT'); // DRAFT, AWAITING_AUTHORIZATION, AUTHORIZED, SUPERSEDED, POSTED
            $table->text('notes')->nullable();
            $table->integer('revision')->default(1);
            $table->integer('material_version')->default(1);
            $table->string('created_by');
            $table->timestamp('submitted_at')->nullable();
            $table->string('authorized_head_by')->nullable();
            $table->string('authorized_finance_by')->nullable();
            $table->timestamp('authorized_at')->nullable();
            $table->string('authorized_head_signature')->nullable();
            $table->string('authorized_finance_signature')->nullable();
            $table->timestamps();

            $table->index(['chapter_id', 'status']);
        });

        Schema::create('opening_count_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('ipc_id')->constrained('opening_counts')->cascadeOnDelete();
            $table->string('variant_id')->index();
            $table->string('unit_id');
            $table->string('location_id');
            $table->string('lot_code')->nullable();
            $table->string('condition')->default('USABLE'); // USABLE, QUARANTINE, REJECTED
            $table->decimal('counted_quantity', 12, 4);
            $table->string('counter_user_id');
            $table->timestamps();

            $table->index(['ipc_id', 'variant_id']);
        });

        Schema::create('opening_rms', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id');
            $table->string('rm_number')->nullable()->index();
            $table->foreignUuid('ipc_id')->constrained('opening_counts');
            $table->string('status')->default('DRAFT'); // DRAFT, INSPECTED, EVIDENCE_MATCHED, POSTED
            $table->string('inspector_user_id')->nullable();
            $table->string('evidence_binding_id')->nullable();
            $table->text('notes')->nullable();
            $table->integer('revision')->default(1);
            $table->integer('material_version')->default(1);
            $table->json('inspection_data')->nullable();
            $table->json('lines_data')->nullable();
            $table->json('snapshot_data')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamps();

            $table->unique('chapter_id', 'unique_chapter_opening');
            $table->index(['chapter_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('opening_rms');
        Schema::dropIfExists('opening_count_lines');
        Schema::dropIfExists('opening_counts');
    }
};
