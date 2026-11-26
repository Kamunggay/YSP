<?php

namespace App\Services\Notifications;

use App\Models\BrowserSession;
use App\Models\User;
use Laravel\Reverb\Application;
use Laravel\Reverb\Connection;
use Laravel\Reverb\Servers\Reverb\Connection as Socket;

final class NotificationConnection extends Connection
{
    /** @var array<string, array{chapter: ?string, authority: ?string}> */
    public array $grants = [];

    public function __construct(Socket $socket, Application $application, string $origin, private readonly BrowserSession $session)
    {
        parent::__construct($socket, $application, $origin);
    }

    public function owns(string $sessionId, string $tokenHash): bool
    {
        return $this->session->id === $sessionId && hash_equals($this->session->token_hash, $tokenHash);
    }

    public function userId(): string
    {
        return $this->session->user_id;
    }

    public function currentUser(): ?User
    {
        $session = BrowserSession::whereKey($this->session->id)->where('token_hash', $this->session->token_hash)
            ->where('expires_at', '>', now())->lockForUpdate()->first();
        $user = $session?->currentUser();
        if (! $user || $user->id !== $this->userId() || ! $session->refreshProgress($user) || $session->next_step !== null) {
            return null;
        }

        return $user;
    }
}
