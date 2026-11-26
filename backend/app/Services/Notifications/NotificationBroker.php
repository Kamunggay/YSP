<?php

namespace App\Services\Notifications;

use App\Http\Requests\AuthInput;
use App\Models\DomainNotificationOutbox;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Reverb\Contracts\ApplicationProvider;
use Laravel\Reverb\Protocols\Pusher\ConnectionRegistry;
use Laravel\Reverb\Protocols\Pusher\Server;
use Laravel\Reverb\Servers\Reverb\Http\Response;
use Psr\Http\Message\RequestInterface;
use RuntimeException;
use Throwable;

final class NotificationBroker
{
    public function __construct(
        private readonly ApplicationProvider $applications,
        private readonly ConnectionRegistry $connections,
        private readonly Server $server,
        private readonly NotificationSubscriptions $subscriptions,
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
            $user = $this->recheck($socket);
            $chapter = $data['chapter_id'];
            $channel = $data['channel_name'];
            $fingerprint = $user && $chapter !== null ? NotificationSubscriptions::fingerprint($user, $chapter) : null;
            if (! $user || $channel !== NotificationSubscriptions::channel($user->id, $chapter)
                || ($chapter !== null && $fingerprint === null)) {
                return new Response([], 403);
            }

            $socket->grants[$channel] = ['chapter' => $chapter, 'authority' => $fingerprint];
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

        $target = $event->chapter_id === null ? $event->resource_id : $event->target_user_id;
        $failed = false;
        foreach ($this->sockets() as $socket) {
            if (! $socket instanceof NotificationConnection || ($target !== null && $target !== $socket->userId())) {
                continue;
            }
            $channel = NotificationSubscriptions::channel($socket->userId(), $event->chapter_id);
            if ($event->chapter_id !== null && ! $this->subscriptions->subscribed($socket, $channel)) {
                continue;
            }

            try {
                DB::transaction(function () use ($socket, $event, $channel) {
                    $user = $this->recheck($socket);
                    if (! $user || ! $this->subscriptions->subscribed($socket, $channel)
                        || ($event->chapter_id !== null && ! $this->reads->allows($user, $event))) {
                        return;
                    }

                    $socket->send(json_encode([
                        'event' => $event->event_name,
                        'channel' => $channel,
                        'data' => json_encode($event->payload_json, JSON_THROW_ON_ERROR),
                    ], JSON_THROW_ON_ERROR));
                });
            } catch (Throwable) {
                $failed = true;
            }
        }
        if ($failed) {
            throw new RuntimeException('Notification delivery incomplete.');
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

        foreach ($socket->grants as $channel => $scope) {
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
