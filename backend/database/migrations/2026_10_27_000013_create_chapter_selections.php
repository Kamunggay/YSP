<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chapter_selections', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->char('session_key', 64)->primary();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('membership_id')->nullable()->constrained()->restrictOnDelete();
            $table->char('revision', 68)->charset('ascii')->collation('ascii_bin');
        });
        $pdo = DB::connection()->getPdo();
        $database = '`'.str_replace('`', '``', DB::connection()->getDatabaseName()).'`';
        $account = $pdo->quote((string) config('database.runtime_username')).'@'.$pdo->quote((string) config('database.runtime_host'));
        DB::unprepared("GRANT UPDATE, DELETE ON {$database}.chapter_selections TO {$account}");
    }

    public function down(): void
    {
        Schema::dropIfExists('chapter_selections');
    }
};
