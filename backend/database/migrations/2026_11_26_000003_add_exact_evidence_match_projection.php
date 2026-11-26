<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evidence_bindings', function (Blueprint $table): void {
            $table->json('match_projection')->nullable();
        });

        Schema::table('action_receipts', function (Blueprint $table): void {
            $table->string('evidence_scope', 36)->default('');
            $table->unique(['chapter_id', 'user_id', 'operation', 'evidence_scope', 'key'], 'action_receipt_lineage_scope');
            $table->dropUnique('action_receipt_scope');
        });
    }

    public function down(): void
    {
        Schema::table('action_receipts', function (Blueprint $table): void {
            $table->unique(['chapter_id', 'user_id', 'operation', 'key'], 'action_receipt_scope');
            $table->dropUnique('action_receipt_lineage_scope');
            $table->dropColumn('evidence_scope');
        });

        Schema::table('evidence_bindings', function (Blueprint $table): void {
            $table->dropColumn('match_projection');
        });
    }
};
