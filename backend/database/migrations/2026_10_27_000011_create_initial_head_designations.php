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
        Schema::create('initial_head_designations', function (Blueprint $table): void {
            $table->engine = 'InnoDB';
            $table->id();
            $table->foreignId('provisioning_id')->unique()->constrained('chapter_provisionings')->restrictOnDelete();
            $table->foreignId('chapter_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->char('operation_public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $table->foreign('operation_public_id')->references('public_id')->on('provider_operation_attempts')->restrictOnDelete();
            $table->json('appointment_snapshot');
            $table->string('reason', 1000);
            $table->timestamp('appointed_at', 6);
        });
        foreach (['UPDATE', 'DELETE'] as $event) {
            DB::unprepared("CREATE TRIGGER initial_head_designations_no_{$event} BEFORE {$event} ON initial_head_designations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Initial Head designation is immutable'");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('initial_head_designations');
    }
};
