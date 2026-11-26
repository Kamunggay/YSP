<?php

namespace App\Services\Notifications;

use Illuminate\Support\Facades\DB;
use Laravel\Reverb\Contracts\ApplicationProvider;
use Laravel\Reverb\Protocols\Pusher\Server;
use Laravel\Reverb\Servers\Reverb\Factory;
use Laravel\Reverb\Servers\Reverb\Http\Response;
use Laravel\Reverb\Servers\Reverb\Http\Route;
use PDOException;
use Symfony\Component\Routing\RouteCollection;

final class NotificationReverb extends Factory
{
    protected static function pusherRoutes(string $path): RouteCollection
    {
        $routes = new RouteCollection;
        $routes->add('sockets', Route::get('/app/{appKey}', new NotificationWebSocket(app(Server::class), app(ApplicationProvider::class))));
        $routes->add('control', Route::post('/internal/notifications/{operation}', [app(NotificationBroker::class), 'control']));
        $routes->add('health', Route::get('/up', static function (): Response {
            try {
                DB::table('browser_sessions')->limit(1)->value('id');
                DB::table('domain_notification_outbox')->limit(1)->value('id');

                return new Response(['status' => 'up']);
            } catch (PDOException) {
                return new Response(['status' => 'unavailable'], 503);
            }
        }));
        $routes->addPrefix($path);

        return $routes;
    }
}
