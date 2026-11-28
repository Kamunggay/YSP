<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_lots', function (Blueprint $table): void {
            $this->provenance($table);
            $table->string('donor_name', 200)->nullable();
            $table->enum('restriction_state', ['unrestricted', 'bounded', 'uninterpreted'])->nullable()->default('unrestricted');
            $table->index(['chapter_id', 'source_kind', 'origin_source_id', 'origin_source_line_id'], 'inv_lots_stage2_source_idx');
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $this->provenance($table);
            $table->unsignedInteger('origin_source_material_version')->nullable();
            $table->decimal('unit_valuation_php', 14, 2)->nullable();
            $table->decimal('total_value_php', 14, 2)->nullable();
            $table->unique(['chapter_id', 'source_rm_id', 'rm_line_id', 'movement_kind'], 'inv_mov_receiving_line_unique');
        });
    }

    public function down(): void
    {
        $columns = ['source_kind', 'rm_line_id', 'origin_source_id', 'origin_source_line_id',
            'origin_source_reference', 'restrictions_json', 'immediately_allocatable'];

        Schema::table('inventory_movements', function (Blueprint $table) use ($columns): void {
            $table->dropUnique('inv_mov_receiving_line_unique');
            $table->dropColumn([...$columns, 'origin_source_material_version', 'unit_valuation_php', 'total_value_php']);
        });
        Schema::table('inventory_lots', function (Blueprint $table) use ($columns): void {
            $table->dropIndex('inv_lots_stage2_source_idx');
            $table->dropColumn([...$columns, 'donor_name', 'restriction_state']);
        });
    }

    private function provenance(Blueprint $table): void
    {
        $table->enum('source_kind', ['ipc_rm', 'po_rm', 'da_rm'])->nullable();
        $table->uuid('rm_line_id')->nullable();
        $table->uuid('origin_source_id')->nullable();
        $table->uuid('origin_source_line_id')->nullable();
        $table->string('origin_source_reference', 80)->nullable();
        $table->json('restrictions_json')->nullable();
        $table->boolean('immediately_allocatable')->nullable()->default(true);
    }
};
