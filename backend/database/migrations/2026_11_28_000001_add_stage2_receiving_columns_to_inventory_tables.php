<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->boolean('immediately_allocatable')->default(true)->after('custodian_user_id');
            $table->uuid('source_doc_id')->nullable()->after('source_reference')->index('inv_lots_source_doc_idx');
            $table->uuid('source_line_id')->nullable()->after('source_doc_id')->index('inv_lots_source_line_idx');
            $table->uuid('rm_line_id')->nullable()->after('source_line_id')->index('inv_lots_rm_line_idx');
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->uuid('rm_line_id')->nullable()->after('source_ipc_line_id');
            $table->uuid('source_doc_id')->nullable()->after('source_ipc_id');
            $table->uuid('source_line_id')->nullable()->after('source_doc_id');
            $table->decimal('unit_valuation_php', 14, 2)->nullable()->after('accepted_value');
            $table->decimal('total_value_php', 14, 2)->nullable()->after('unit_valuation_php');

            $table->unique(
                ['chapter_id', 'source_rm_id', 'rm_line_id', 'movement_kind'],
                'inv_mov_receiving_line_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->dropUnique('inv_mov_receiving_line_unique');
            $table->dropColumn([
                'rm_line_id',
                'source_doc_id',
                'source_line_id',
                'unit_valuation_php',
                'total_value_php',
            ]);
        });

        Schema::table('inventory_lots', function (Blueprint $table): void {
            $table->dropIndex('inv_lots_rm_line_idx');
            $table->dropIndex('inv_lots_source_line_idx');
            $table->dropIndex('inv_lots_source_doc_idx');
            $table->dropColumn([
                'immediately_allocatable',
                'source_doc_id',
                'source_line_id',
                'rm_line_id',
            ]);
        });
    }
};
