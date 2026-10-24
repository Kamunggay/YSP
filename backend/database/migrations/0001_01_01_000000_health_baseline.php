<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;

// P01 reserves the migration runner checkpoint; domain DDL starts in P02.
return new class extends Migration
{
    public function up(): void {}

    public function down(): void {}
};
