<?php

namespace App\Console\Commands;

use App\Services\Notifications\NotificationBroker;
use App\Services\Notifications\NotificationReverb;
use App\Services\Notifications\NotificationSubscriptions;
use App\Services\Notifications\NotificationTransport;
use Illuminate\Support\Facades\Log;
use Laravel\Reverb\Protocols\Pusher\EventHandler;
use Laravel\Reverb\Servers\Reverb\Console\Commands\StartServer;
use Pdo\Mysql;
use React\EventLoop\Loop;
use Throwable;

final class ServeNotifications extends StartServer
{
    protected $signature = 'notifications:serve {--host=0.0.0.0} {--port=8080}';

    protected $description = 'Serve the private Stage 1 Reverb connection and notification transport';

    public function handle(): void
    {
        NotificationTransport::secret('channel');
        if (! preg_match('/\A[A-Za-z0-9_-]{1,100}\z/', config('notifications.app_key'))) {
            $this->error('Invalid public notification application key.');

            return;
        }

        if (config('database.default') === 'mysql') {
            config(['database.connections.mysql.options' => [
                Mysql::ATTR_INIT_COMMAND => 'SET SESSION innodb_lock_wait_timeout = 1',
            ] + config('database.connections.mysql.options', [])]);
        }

        $this->laravel->singleton(NotificationSubscriptions::class);
        $this->laravel->alias(NotificationSubscriptions::class, EventHandler::class);
        $loop = Loop::get();
        $host = $this->option('host');
        $port = $this->option('port');
        $server = NotificationReverb::make($host, $port, loop: $loop);
        $broker = $this->laravel->make(NotificationBroker::class);
        $this->ensureStaleConnectionsAreCleaned($loop);
        $this->ensureRestartCommandIsRespected($server, $loop, $host, $port);
        $loop->addPeriodicTimer(3, static function () use ($broker) {
            try {
                $broker->sweep();
            } catch (Throwable $failure) {
                Log::warning('Notification connection recheck failed.', ['type' => $failure::class]);
            }
        });
        $this->components->info("Starting Stage 1 Reverb on {$host}:{$port}.");
        $server->start();
    }
}
