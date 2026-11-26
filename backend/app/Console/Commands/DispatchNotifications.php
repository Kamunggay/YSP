<?php

namespace App\Console\Commands;

use App\Models\DomainNotificationOutbox;
use App\Services\Notifications\NotificationTransport;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

final class DispatchNotifications extends Command
{
    protected $signature = 'notifications:dispatch {--once : Process one batch and exit}';

    protected $description = 'Publish pending Stage 1 notifications through the private Reverb transport';

    public function handle(NotificationTransport $transport): int
    {
        do {
            $failed = $this->dispatch($transport);
            if ($this->option('once')) {
                return $failed ? self::FAILURE : self::SUCCESS;
            }

            sleep(1);
        } while (true);
    }

    private function dispatch(NotificationTransport $transport): bool
    {
        $failed = false;
        try {
            $events = DomainNotificationOutbox::where('status', 'pending')->orderBy('last_attempt_at')
                ->orderBy('created_at')->orderBy('id')->limit(50)->pluck('id');

            foreach ($events as $id) {
                DomainNotificationOutbox::whereKey($id)->where('status', 'pending')->update([
                    'last_attempt_at' => now(),
                    'attempts' => DB::raw('attempts + 1'),
                ]);
                try {
                    if (! $transport->call('dispatch', ['event_id' => $id])->ok()) {
                        $failed = true;
                    }
                } catch (Throwable) {
                    $failed = true;
                }
            }
            if ($failed) {
                Log::warning('Stage 1 notification dispatch failed. Pending events remain available for retry.');
            } else {
                file_put_contents('/tmp/ysp-notification-worker', (string) time());
            }
        } catch (Throwable $failure) {
            Log::warning('Stage 1 notification worker unavailable.', ['type' => $failure::class]);

            return true;
        }

        return $failed;
    }
}
