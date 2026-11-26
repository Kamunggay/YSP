<?php

namespace App\Services\Notifications;

use App\Exceptions\ContractException;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\CanonicalJson;
use Illuminate\Support\Facades\DB;
use Laravel\Reverb\Contracts\Connection;
use Laravel\Reverb\Protocols\Pusher\EventHandler;

final class NotificationSubscriptions extends EventHandler
{
    public static function channel(string $userId, ?string $chapter = null): string
    {
        return $chapter === null ? "private-stage1.user.{$userId}" : "private-stage1.chapter.{$chapter}.user.{$userId}";
    }

    public static function fingerprint(User $user, string $chapter): ?string
    {
        try {
            $authority = ChapterAuthority::forChapter($user, $chapter);

            return CanonicalJson::sha256([$authority->version, $authority->grants->pluck('id')->sort()->values()->all()]);
        } catch (ContractException $denied) {
            if ($denied->statusCode !== 404) {
                throw $denied;
            }

            return null;
        }
    }

    public function subscribe(Connection $connection, string $channel, ?string $auth = null, ?string $data = null): void
    {
        $chapter = null;
        if (preg_match('/\Aprivate-stage1\.chapter\.([0-9a-f-]{36})\.user\./', $channel, $matches)) {
            $chapter = $matches[1];
        }

        DB::transaction(function () use ($connection, $chapter, $channel, $auth, $data) {
            $user = $connection instanceof NotificationConnection ? $connection->currentUser() : null;
            $fingerprint = $user && $chapter !== null ? self::fingerprint($user, $chapter) : null;
            $grant = $connection instanceof NotificationConnection ? ($connection->grants[$channel] ?? null) : null;
            if ($grant !== null && ($grant['authority'] !== $fingerprint || ! $user)) {
                $this->unsubscribe($connection, $channel);
                $grant = null;
            }
            if (! $user || $grant === null || $data !== null || $channel !== self::channel($user->id, $chapter)
                || ($chapter !== null && $fingerprint === null) || ! str_starts_with($auth ?? '', $connection->app()->key().':')) {
                $this->sendSubscriptionError($connection, $channel, 'AuthError', 'Private subscription unavailable.');

                return;
            }

            parent::subscribe($connection, $channel, $auth);
        });
    }

    public function subscribed(NotificationConnection $connection, string $channel): bool
    {
        return $this->channels->for($connection->app())->find($channel)?->subscribed($connection) ?? false;
    }

    public function unsubscribe(Connection $connection, string $channel): void
    {
        parent::unsubscribe($connection, $channel);
        if ($connection instanceof NotificationConnection) {
            unset($connection->grants[$channel]);
        }
    }
}
