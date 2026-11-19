<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('internal_rfs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('rf_number')->nullable();
            $table->string('requester_user_id')->index();
            $table->string('requesting_unit_id')->nullable()->index();
            $table->string('event_id')->nullable();
            $table->string('purpose')->default('INTERNAL_USE');
            $table->text('justification')->nullable();
            $table->timestamp('needed_at')->nullable();
            $table->string('status')->default('draft'); // draft|submitted|approved|returned|canceled
            $table->string('fulfillment_status')->default('not_approved'); // not_approved|outstanding|partially_issued|fulfilled|closed_canceled
            $table->unsignedInteger('version')->default(1);
            $table->unsignedInteger('material_version')->default(1);
            $table->unsignedInteger('progress_version')->default(1);
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->string('approved_by_user_id')->nullable();
            $table->string('approved_duty_grant_id')->nullable();
            $table->string('approved_alternate_id')->nullable();
            $table->string('approval_route_policy_id')->nullable();
            $table->unsignedInteger('approved_material_version')->nullable();
            $table->text('return_reason')->nullable();
            $table->text('cancel_reason')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->unique(['chapter_id', 'rf_number'], 'rf_chapter_number_unique');
            $table->index(['chapter_id', 'status'], 'rf_chapter_status_idx');
        });

        Schema::create('internal_rf_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('rf_id')->constrained('internal_rfs')->cascadeOnDelete();
            $table->unsignedInteger('line_order')->default(0);
            $table->string('variant_id')->nullable()->index();
            $table->string('unit_id')->nullable();
            $table->decimal('requested_quantity', 18, 6)->nullable();
            $table->decimal('approved_quantity', 18, 6)->nullable();
            $table->decimal('reserved_quantity', 18, 6)->default(0);
            $table->decimal('blocked_reserved_quantity', 18, 6)->default(0);
            $table->decimal('issued_quantity', 18, 6)->default(0);
            $table->decimal('canceled_quantity', 18, 6)->default(0);
            $table->json('identity_at_approval')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('internal_rf_versions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('rf_id')->constrained('internal_rfs')->cascadeOnDelete();
            $table->string('chapter_id')->index();
            $table->unsignedInteger('version');
            $table->unsignedInteger('material_version');
            $table->unsignedInteger('progress_version');
            $table->string('event_type');
            $table->string('actor_user_id')->nullable();
            $table->text('reason')->nullable();
            $table->json('snapshot_json');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['rf_id', 'version'], 'rf_versions_unique');
        });

        Schema::create('reference_sequences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id');
            $table->string('document_kind'); // IPC|RM|RF|IS_AR
            $table->unsignedSmallInteger('sequence_year');
            $table->string('prefix');
            $table->unsignedBigInteger('last_sequence')->default(0);
            $table->unsignedTinyInteger('sequence_width')->default(6);
            $table->timestamps();

            $table->unique(['chapter_id', 'document_kind', 'sequence_year'], 'ref_seq_chapter_kind_year_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reference_sequences');
        Schema::dropIfExists('internal_rf_versions');
        Schema::dropIfExists('internal_rf_lines');
        Schema::dropIfExists('internal_rfs');
    }
};
