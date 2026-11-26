<?php

namespace App\Services\Notifications;

use App\Http\Requests\AuthInput;
use App\Models\DomainNotificationOutbox;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Reverb\Contracts\ApplicationProvider;
use Laravel\Reverb\Protocols\Pusher\ConnectionRegistry;
use Laravel\Reverb\Protocols\Pusher\EventHandler;
use Laravel\Reverb\Protocols\Pusher\Server;
use Laravel\Reverb\Servers\Reverb\Http\Response;
use Psr\Http\Message\RequestInterface;
use Throwable;

final class NotificationBroker
{
    public function __construct(
        private readonly ApplicationProvider $applications,
        private readonly ConnectionRegistry $connections,
        private readonly Server $server,
        private readonly EventHandler $subscriptions,
        private readonly NotificationSubjectRead $reads,
    ) {}

    public function control(RequestInterface $request, string $operation): Response
    {
        $body = (string) $request->getBody();
        if (! hash_equals(NotificationTransport::signature($operation, $body), $request->getHeaderLine('X-Notification-Signature'))) {
            return new Response([], 403);
        }

        try {
            $data = json_decode($body, true, flags: JSON_THROW_ON_ERROR);

            return match ($operation) {
                'authorize' => $this->authorize($data),
                'dispatch' => $this->dispatch($data['event_id']),
                default => new Response([], 404),
            };
        } catch (Throwable $failure) {
            Log::warning('Notification broker request failed.', ['type' => $failure::class]);

            return new Response([], 503);
        }
    }

    private function authorize(array $data): Response
    {
        $socket = $this->sockets()[$data['socket_id']] ?? null;
        if (! $socket instanceof NotificationConnection || ! $socket->owns($data['session_id'], $data['token_hash'])) {
            return new Response([], 403);
        }

        return DB::transaction(function () use ($socket, $data) {
            $user = $socket->currentUser();
            $chapter = $data['chapter_id'];
            $channel = $data['channel_name'];
            if (! $user || $channel !== NotificationSubscriptions::channel($user->id, $chapter)
                || ($chapter !== null && ! NotificationSubscriptions::fingerprint($user, $chapter))) {
                return new Response([], 403);
            }

            $signature = hash_hmac('sha256', $socket->id().':'.$channel, $socket->app()->secret());

            return new Response(['auth' => $socket->app()->key().':'.$signature]);
        });
    }

    private function dispatch(string $id): Response
    {
        if (! preg_match(AuthInput::UUID, $id)) {
            return new Response([], 404);
        }
        $event = DomainNotificationOutbox::whereKey($id)->first();
        if (! $event) {
            return new Response([], 404);
        }
        if ($event->status !== 'pending') {
            return new Response([]);
        }

        foreach ($this->sockets() as $socket) {
            if (! $socket instanceof NotificationConnection) {
                continue;
            }
            $target = $event->target_user_id ?? ($event->chapter_id === null ? $event->resource_id : null);
            if ($target !== null && $target !== $socket->userId()) {
                continue;
            }

            DB::transaction(function () use ($socket, $event) {
                $user = $this->recheck($socket);
                if (! $user) {
                    return;
                }
                $channel = NotificationSubscriptions::channel($user->id, $event->chapter_id);
                if (! isset($socket->subscriptions[$channel])
                    || ($event->chapter_id !== null && ! $this->reads->allows($user, $event))) {
                    return;
                }

                $socket->send(json_encode([
                    'event' => $event->event_name,
                    'channel' => $channel,
                    'data' => json_encode($event->payload_json, JSON_THROW_ON_ERROR),
                ], JSON_THROW_ON_ERROR));
            });
        }

        $event->update(['status' => 'dispatched', 'dispatched_at' => now()]);

        return new Response([]);
    }

    public function sweep(): void
    {
        foreach ($this->sockets() as $socket) {
            if ($socket instanceof NotificationConnection) {
                DB::transaction(fn () => $this->recheck($socket));
            }
        }
    }

    private function recheck(NotificationConnection $socket): ?User
    {
        $user = $socket->currentUser();
        if (! $user) {
            $this->server->close($socket);

            return null;
        }

        foreach ($socket->subscriptions as $channel => $scope) {
            if ($scope['chapter'] !== null && $scope['authority'] !== NotificationSubscriptions::fingerprint($user, $scope['chapter'])) {
                $this->subscriptions->unsubscribe($socket, $channel);
            }
        }

        return $user;
    }

    private function sockets(): array
    {
        return $this->connections->for($this->applications->findByKey(config('notifications.app_key')));
    }
}
