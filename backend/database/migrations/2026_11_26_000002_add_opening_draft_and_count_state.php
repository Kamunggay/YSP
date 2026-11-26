<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opening_counts', function (Blueprint $table): void {
            $table->json('material_json')->nullable();
            $table->json('counts_json')->nullable();
            $table->json('signed_ipc_json')->nullable();
            $table->json('authorizations_json')->nullable();
            $table->uuid('posted_rm_id')->nullable();
        });

        Schema::table('opening_rms', function (Blueprint $table): void {
            $table->dropUnique('unique_chapter_opening');
            $table->uuid('prepared_by')->nullable();
            $table->json('material_json')->nullable();
            $table->char('snapshot_sha256', 64)->nullable();
            $table->json('acknowledgment_json')->nullable();
            $table->uuid('outcome_id')->nullable();
            $table->string('posted_chapter_id')->nullable()->unique('unique_chapter_posted_opening');
        });

        Schema::table('opening_record_history', function (Blueprint $table): void {
            $table->json('operation_json')->nullable();
            $table->text('reason')->nullable();
            $table->unique(['record_type', 'record_id', 'revision'], 'open_rec_hist_unique_rev');
        });
    }

    public function down(): void
    {
        Schema::table('opening_record_history', function (Blueprint $table): void {
            $table->dropUnique('open_rec_hist_unique_rev');
            $table->dropColumn(['operation_json', 'reason']);
        });

        Schema::table('opening_rms', function (Blueprint $table): void {
            $table->dropUnique('unique_chapter_posted_opening');
            $table->dropColumn([
                'prepared_by',
                'material_json',
                'snapshot_sha256',
                'acknowledgment_json',
                'outcome_id',
                'posted_chapter_id',
            ]);
            $table->unique('chapter_id', 'unique_chapter_opening');
        });

        Schema::table('opening_counts', function (Blueprint $table): void {
            $table->dropColumn([
                'material_json',
                'counts_json',
                'signed_ipc_json',
                'authorizations_json',
                'posted_rm_id',
            ]);
        });
    }
};
