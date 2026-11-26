<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chapter_opening_guards', function (Blueprint $table): void {
            $table->uuid('chapter_id')->primary();
            $table->unsignedInteger('stock_version')->default(1);
            $table->uuid('posted_rm_id')->nullable()->unique('chapter_opening_guard_rm_unique');
            $table->uuid('posted_ipc_id')->nullable();
            $table->uuid('outcome_id')->nullable()->unique('chapter_opening_guard_outcome_unique');
            $table->json('outcome_json')->nullable();
            $table->timestamp('posted_at', 6)->nullable();
            $table->timestamps();
        });

        Schema::create('opening_findings', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id')->index();
            $table->uuid('rm_id')->index();
            $table->uuid('ipc_id')->index();
            $table->uuid('ipc_line_id');
            $table->uuid('lot_id');
            $table->uuid('variant_id');
            $table->uuid('unit_id');
            $table->uuid('location_id');
            $table->string('condition', 32);
            $table->decimal('quantity', 18, 6);
            $table->unsignedTinyInteger('quantity_scale')->default(0);
            $table->string('reason', 500);
            $table->uuid('recorded_by');
            $table->timestamp('recorded_at', 6);
            $table->string('resolution', 64)->default('requires_later_approved_treatment');

            $table->unique(['chapter_id', 'rm_id', 'ipc_line_id', 'condition'], 'opening_findings_line_cond_unique');
            $table->index(['chapter_id', 'rm_id', 'recorded_at', 'id'], 'opening_findings_rm_order_idx');
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->string('movement_kind', 64)->nullable();
            $table->uuid('source_rm_id')->nullable();
            $table->uuid('source_ipc_id')->nullable();
            $table->uuid('source_ipc_line_id')->nullable();
            $table->uuid('lot_id')->nullable();
            $table->string('rm_reference', 80)->nullable();
            $table->unsignedInteger('rm_material_version')->nullable();
            $table->string('ipc_reference', 80)->nullable();
            $table->unsignedInteger('ipc_material_version')->nullable();
            $table->unsignedTinyInteger('quantity_scale')->default(0);
            $table->decimal('accepted_value', 14, 2)->nullable();
            $table->char('currency', 3)->nullable();
            $table->uuid('posted_by')->nullable();

            $table->decimal('quantity', 18, 6)->change();
            $table->decimal('balance_after', 18, 6)->change();
            $table->timestamp('created_at', 6)->useCurrent()->change();

            $table->unique(
                ['chapter_id', 'source_rm_id', 'source_ipc_line_id', 'movement_kind'],
                'inv_mov_opening_line_unique'
            );
            $table->index(['chapter_id', 'source_rm_id', 'created_at', 'id'], 'inv_mov_opening_rm_order_idx');
        });

        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->decimal('quantity_on_hand', 18, 6)->default(0)->change();
        });

        Schema::table('opening_rms', function (Blueprint $table): void {
            $table->timestamp('posted_at', 6)->nullable()->change();
        });

        // Backfill pre-existing chapter opening guards for additive upgrades.
        $now = now('UTC');
        $chapters = DB::table('chapters')->pluck('id');
        foreach ($chapters as $chapterId) {
            $postedRm = DB::table('opening_rms')
                ->where('chapter_id', $chapterId)
                ->whereIn('status', ['posted', 'POSTED'])
                ->first();

            $outcomeId = $postedRm?->outcome_id;
            if ($postedRm && ! $outcomeId) {
                $outcomeId = (string) Str::uuid();
                DB::table('opening_rms')->where('id', $postedRm->id)->update([
                    'outcome_id' => $outcomeId,
                    'posted_chapter_id' => $chapterId,
                ]);
            } elseif ($postedRm && ! $postedRm->posted_chapter_id) {
                DB::table('opening_rms')->where('id', $postedRm->id)->update([
                    'posted_chapter_id' => $chapterId,
                ]);
            }

            DB::table('chapter_opening_guards')->insertOrIgnore([
                'chapter_id' => $chapterId,
                'stock_version' => $postedRm ? 2 : 1,
                'posted_rm_id' => $postedRm?->id,
                'posted_ipc_id' => $postedRm?->ipc_id,
                'outcome_id' => $outcomeId,
                'outcome_json' => null,
                'posted_at' => $postedRm?->posted_at,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('opening_rms', function (Blueprint $table): void {
            $table->timestamp('posted_at')->nullable()->change();
        });

        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->decimal('quantity_on_hand', 12, 4)->default(0)->change();
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->dropUnique('inv_mov_opening_line_unique');
            $table->dropIndex('inv_mov_opening_rm_order_idx');
            $table->dropColumn([
                'movement_kind',
                'source_rm_id',
                'source_ipc_id',
                'source_ipc_line_id',
                'lot_id',
                'rm_reference',
                'rm_material_version',
                'ipc_reference',
                'ipc_material_version',
                'quantity_scale',
                'accepted_value',
                'currency',
                'posted_by',
            ]);
            $table->decimal('quantity', 12, 4)->change();
            $table->decimal('balance_after', 12, 4)->change();
            $table->timestamp('created_at')->useCurrent()->change();
        });

        Schema::dropIfExists('opening_findings');
        Schema::dropIfExists('chapter_opening_guards');
    }
};
