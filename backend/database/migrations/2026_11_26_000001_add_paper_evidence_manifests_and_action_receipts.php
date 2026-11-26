<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('evidence_blobs', function (Blueprint $table): void {
            $table->uuid('version_id')->nullable()->index();
            $table->unsignedInteger('position')->nullable();
            $table->unique(['evidence_id', 'version', 'position'], 'evidence_attachment_position');
            $table->index('payload_path');
        });

        Schema::create('action_receipts', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->uuid('user_id');
            $table->string('operation', 128);
            $table->uuid('key');
            $table->char('fingerprint', 64);
            $table->unsignedSmallInteger('status');
            $table->json('result');
            $table->timestamps();
            $table->unique(['chapter_id', 'user_id', 'operation', 'key'], 'action_receipt_scope');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('action_receipts');

        Schema::table('evidence_blobs', function (Blueprint $table): void {
            $table->dropIndex(['payload_path']);
            $table->dropIndex(['version_id']);
            $table->dropUnique('evidence_attachment_position');
            $table->dropColumn(['version_id', 'position']);
        });
    }
};
