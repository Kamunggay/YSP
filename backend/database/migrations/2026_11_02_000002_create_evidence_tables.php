<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('evidence_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->string('evidence_type')->default('paper'); // paper, opening_receipt, hold_clearance, actual_issue
            $table->string('purpose')->nullable();
            $table->uuid('record_id')->nullable();
            $table->text('description')->nullable();
            $table->string('technical_state')->default('ready'); // ready, invalid
            $table->string('invalid_reason')->nullable();
            $table->string('created_by');
            $table->timestamps();
        });

        Schema::create('evidence_blobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('evidence_id')->index();
            $table->unsignedInteger('version')->default(1);
            $table->uuid('supersedes_version_id')->nullable();
            $table->uuid('superseded_by_version_id')->nullable();
            $table->text('replacement_reason')->nullable();
            $table->string('sha256_hash');
            $table->string('mime_type');
            $table->unsignedBigInteger('file_size');
            $table->string('payload_path');
            $table->mediumText('raw_content')->nullable(); // For test/in-memory storage
            $table->string('created_by');
            $table->timestamps();
        });

        Schema::create('evidence_bindings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('chapter_id')->index();
            $table->uuid('evidence_id');
            $table->uuid('blob_id');
            $table->string('source_type');
            $table->string('source_id');
            $table->string('recipient_name');
            $table->string('item_fingerprint');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('evidence_bindings');
        Schema::dropIfExists('evidence_blobs');
        Schema::dropIfExists('evidence_records');
    }
};
