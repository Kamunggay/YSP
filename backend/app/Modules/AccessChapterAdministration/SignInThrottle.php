<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SignInThrottle
{
    private const WINDOW_SECONDS = 900;

    private const FAILED_PASSWORD_LIMIT = 5;

    private const IP_ATTEMPT_LIMIT = 60;

    public function run(Request $request, SessionContract $contract, Closure $attempt): JsonResponse
    {
        $body = json_decode($request->getContent());
        $email = is_object($body) && isset($body->email) && is_string($body->email)
            ? strtolower(trim($body->email)) : '';
        $identityKey = hash('sha256', 'password:'.$email);
        $ipKey = hash('sha256', 'ip:'.$request->ip());
        $limits = [$identityKey => self::FAILED_PASSWORD_LIMIT, $ipKey => self::IP_ATTEMPT_LIMIT];
        ksort($limits);
        // Duplicate INSERT IGNORE takes a shared lock. Finish initialization
        // before taking exclusive counter locks to avoid concurrent upgrades.
        foreach ($limits as $key => $limit) {
            DB::table('session_throttles')->insertOrIgnore(['key' => $key, 'attempts' => 0, 'expires_at' => time() + self::WINDOW_SECONDS]);
        }

        return DB::transaction(function () use ($limits, $identityKey, $ipKey, $contract, $attempt): JsonResponse {
            $now = time();
            $counters = [];
            foreach ($limits as $key => $limit) {
                $row = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
                if ($row->expires_at <= $now) {
                    $row->attempts = 0;
                    $row->expires_at = $now + self::WINDOW_SECONDS;
                    DB::table('session_throttles')->where('key', $key)->update(['attempts' => 0, 'expires_at' => $row->expires_at]);
                }
                $counters[$key] = $row;
            }
            if ($counters[$ipKey]->attempts >= self::IP_ATTEMPT_LIMIT) {
                return $contract->failure('SessionThrottled', 429)->header('Retry-After', (string) ($counters[$ipKey]->expires_at - $now));
            }
            DB::table('session_throttles')->where('key', $ipKey)->increment('attempts');
            if ($counters[$identityKey]->attempts >= self::FAILED_PASSWORD_LIMIT) {
                return $contract->failure('SessionThrottled', 429)->header('Retry-After', (string) ($counters[$identityKey]->expires_at - $now));
            }
            $response = $attempt();
            if ($response->getStatusCode() === 401) {
                DB::table('session_throttles')->where('key', $identityKey)->increment('attempts');
            }

            return $response;
        });
    }
}
