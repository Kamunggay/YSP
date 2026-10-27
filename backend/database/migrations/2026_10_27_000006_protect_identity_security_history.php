<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['UPDATE', 'DELETE'] as $operation) {
            $trigger = 'global_security_events_no_'.strtolower($operation);
            DB::unprepared("CREATE TRIGGER {$trigger} BEFORE {$operation} ON global_security_events
                FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Security history is append-only'");
        }
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS global_security_events_no_update');
        DB::unprepared('DROP TRIGGER IF EXISTS global_security_events_no_delete');
    }
};
