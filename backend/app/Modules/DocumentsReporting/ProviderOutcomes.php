<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class ProviderOutcomes
{
    /** @param array<string, string> $scope */
    public function replay(array $scope, string $action, string $key, string $fingerprint): ?JsonResponse
    {
        $attempt = DB::table('provider_operation_attempts')->where('organization_id', $scope['organization_id'])
            ->where('provider_user_id', $scope['provider_user_id'])->where('action_code', $action)
            ->where('idempotency_key', $key)->first();
        if ($attempt === null) {
            return null;
        }
        if (! hash_equals($attempt->payload_hash, $fingerprint)) {
            return response()->json(['code' => 'idempotency_conflict', 'message' => 'Review the original immutable attempt.',
                'next_action' => 'review_original_attempt'], 409);
        }
        $operation = DB::table('provider_operations')->where('attempt_id', $attempt->id)->first();
        if ($operation === null) {
            throw new \RuntimeException('Terminal result is unavailable.');
        }
        $result = json_decode($operation->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        $result['operation']['replayed'] = true;

        return response()->json($result, $operation->http_status);
    }

    /** @param array<string, mixed> $scope
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $result
     */
    public function record(array $scope, string $action, string $key, string $fingerprint, string $operationId, object $grant, array $actor, array $result, string $time, int $status): void
    {
        DB::table('provider_operation_attempts')->insert([
            'public_id' => $operationId, 'organization_id' => $scope['organization_id'],
            'provider_user_id' => $scope['provider_user_id'], 'action_code' => $action,
            'idempotency_key' => $key, 'payload_hash' => $fingerprint,
            'input_schema' => ($action === 'provider.initial_head.appoint' ? 'AppointInitialHeadRequest' : 'CreateProvisionedChapterRequest').'@p02.09-review.1', 'created_at' => $time,
        ]);
        $attempt = DB::connection()->getPdo()->lastInsertId();
        DB::table('provider_actor_attributions')->insert([
            'attempt_id' => $attempt, 'provider_role_grant_id' => $grant->id, 'authority_version' => $grant->authority_version,
            'actor_snapshot' => json_encode($actor, JSON_THROW_ON_ERROR), 'occurred_at' => $time,
        ]);
        $attribution = DB::connection()->getPdo()->lastInsertId();
        DB::table('provider_operations')->insert([
            'attempt_id' => $attempt, 'actor_attribution_id' => $attribution,
            'outcome' => $result['operation']['outcome'], 'http_status' => $status,
            'result_snapshot' => json_encode($result, JSON_THROW_ON_ERROR), 'committed_at' => $time,
        ]);
        $operation = DB::connection()->getPdo()->lastInsertId();
        DB::table('provider_audit_events')->insert([
            'operation_id' => $operation, 'event_code' => $action.'.'.$result['operation']['outcome'],
            'after_snapshot' => json_encode($result, JSON_THROW_ON_ERROR), 'occurred_at' => $time,
        ]);
        // This operation has no required asynchronous effect. Never invent a
        // notification or membership job just to populate follow-up intent.
    }
}
