<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SignInThrottle
{
    public function run(Request $request, SessionContract $contract, Closure $attempt): JsonResponse
    {
        $body = json_decode($request->getContent());
        $email = is_object($body) && isset($body->email) && is_string($body->email)
            ? strtolower(trim($body->email)) : '';
        $identityKey = hash('sha256', 'password:'.$email);
        $ipKey = hash('sha256', 'ip:'.$request->ip());
        $limits = [$identityKey => 5, $ipKey => 60];
        ksort($limits);

        return DB::transaction(function () use ($limits, $identityKey, $ipKey, $contract, $attempt): JsonResponse {
            $now = time();
            foreach ($limits as $key => $limit) {
                DB::table('session_throttles')->insertOrIgnore(['key' => $key, 'attempts' => 0, 'expires_at' => $now + 900]);
                $row = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
                if ($row->expires_at <= $now) {
                    DB::table('session_throttles')->where('key', $key)->update(['attempts' => 0, 'expires_at' => $now + 900]);
                } elseif ($row->attempts >= $limit) {
                    return $contract->failure('SessionThrottled', 429)->header('Retry-After', (string) ($row->expires_at - $now));
                }
            }
            $response = $attempt();
            DB::table('session_throttles')->where('key', $ipKey)->increment('attempts');
            if ($response->getStatusCode() === 401) {
                DB::table('session_throttles')->where('key', $identityKey)->increment('attempts');
            }

            return $response;
        });
    }
}
