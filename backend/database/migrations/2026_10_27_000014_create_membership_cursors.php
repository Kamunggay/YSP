<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('membership_cursors', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('token', 68)->charset('ascii')->collation('ascii_bin')->primary();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('auth_version');
            $table->unsignedSmallInteger('page_limit');
            $table->unsignedBigInteger('after_chapter_id');
            $table->timestamp('expires_at', 6)->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_cursors');
    }
};
