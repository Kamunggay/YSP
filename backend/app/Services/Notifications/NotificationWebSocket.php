<?php

namespace App\Services\Notifications;

use App\Http\BrowserSessionHttp;
use App\Models\BrowserSession;
use Illuminate\Support\Facades\DB;
use Laravel\Reverb\Connection as ReverbConnection;
use Laravel\Reverb\Protocols\Pusher\Http\Controllers\PusherController;
use Laravel\Reverb\Servers\Reverb\Connection;
use Psr\Http\Message\RequestInterface;

final class NotificationWebSocket extends PusherController
{
    protected function connection(RequestInterface $request, Connection $connection, string $key): ?ReverbConnection
    {
        $origin = rtrim(config('app.url'), '/');
        $host = parse_url($origin, PHP_URL_HOST);
        $port = parse_url($origin, PHP_URL_PORT);
        preg_match_all('/(?:^|;\s*)ysp_session=([a-f0-9]{64})(?=;|$)/', $request->getHeaderLine('Cookie'), $cookies);

        if ($key === config('notifications.app_key') && $request->getHeader('Origin') === [$origin]
            && $request->getHeaderLine('Host') === $host.($port ? ':'.$port : '')
            && (str_starts_with($origin, 'https://') || BrowserSessionHttp::loopbackHttp())
            && count($cookies[1]) === 1) {
            $session = DB::transaction(function () use ($cookies) {
                $session = BrowserSession::forToken($cookies[1][0]);
                $user = $session?->currentUser();

                return $user && $session->refreshProgress($user) && $session->next_step === null ? $session : null;
            });

            if ($session !== null) {
                return new NotificationConnection($connection, $this->applications->findByKey($key), $origin, $session);
            }
        }

        $connection->send('{"event":"pusher:error","data":"{\"code\":4009,\"message\":\"Private connection unavailable\"}"}');
        $connection->close();

        return null;
    }
}
