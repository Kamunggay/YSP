<?php

namespace App\Services\Notifications;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class NotificationTransport
{
    public static function secret(string $purpose): string
    {
        $key = config('notifications.app_secret') ?: config('app.key');
        if (! is_string($key) || $key === '') {
            throw new RuntimeException('Notification credentials unavailable.');
        }

        return hash_hmac('sha256', 'ysp-notifications:'.$purpose, $key);
    }

    public function call(string $operation, array $data): Response
    {
        $body = json_encode($data, JSON_THROW_ON_ERROR);

        return Http::connectTimeout(1)->timeout(8)->withOptions(['allow_redirects' => false])
            ->withHeaders(['X-Notification-Signature' => self::signature($operation, $body)])
            ->withBody($body, 'application/json')
            ->post(rtrim(config('notifications.broker_url'), '/').'/internal/notifications/'.$operation);
    }

    public static function signature(string $operation, string $body): string
    {
        return hash_hmac('sha256', $operation."\n".$body, self::secret('broker'));
    }
}
