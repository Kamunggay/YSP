<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('domain_notification_outbox', function (Blueprint $table) {
            $table->unsignedInteger('attempts')->default(0);
            $table->dateTime('last_attempt_at', 6)->nullable();
            $table->index(['status', 'last_attempt_at', 'created_at'], 'notification_retry_order');
        });
    }

    public function down(): void
    {
        Schema::table('domain_notification_outbox', function (Blueprint $table) {
            $table->dropIndex('notification_retry_order');
            $table->dropColumn(['attempts', 'last_attempt_at']);
        });
    }
};
