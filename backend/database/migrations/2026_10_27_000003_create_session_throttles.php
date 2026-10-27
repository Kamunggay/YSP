<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('session_throttles', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('key', 64)->charset('ascii')->collation('ascii_bin')->primary();
            $table->unsignedInteger('attempts');
            $table->unsignedBigInteger('expires_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_throttles');
    }
};
