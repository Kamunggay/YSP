<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

final class ChapterOutcomes
{
    public function failure(string $chapter, int $status): JsonResponse
    {
        $forbidden = in_array($status, [401, 403], true);
        $invalid = $status === 400;

        return response()->json(['schema_version' => '1.0', 'chapter_id' => $forbidden ? null : $chapter,
            'action_result' => $forbidden ? 'forbidden' : ($invalid ? 'blocked' : 'uncertain'),
            'operation' => null, 'record' => null, 'field_feedback' => [],
            'blocking_reason' => ['code' => $forbidden ? 'FORBIDDEN' : ($invalid ? 'INVALID_LOOKUP' : 'LOOKUP_UNAVAILABLE'),
                'message' => $forbidden ? 'Current authority does not permit this action or result.' : 'Preserve the original attempt and review lookup availability and selectors.'],
            'permitted_next_actions' => [['code' => $forbidden ? 'request_access' : ($invalid ? 'correct_input' : 'lookup_operation'),
                'label' => 'Review current access and the original attempt']],
            'input_policy' => 'preserve', 'lookup_state' => $forbidden || $invalid ? null : 'unavailable'], $status);
    }

    public function replay(string $chapter, string $action, string $key, string $fingerprint, string $actor): ?JsonResponse
    {
        $stored = DB::table('chapter_operations')->where('chapter_id', $chapter)->where('action_code', $action)->where('idempotency_key', $key)->sharedLock()->first();
        if ($stored === null) {
            return null;
        }
        if ((string) $stored->actor_user_id !== $actor) {
            return response()->json(['code' => 'forbidden', 'message' => 'This request is not permitted.'], 403);
        }
        if (! hash_equals($stored->payload_hash, $fingerprint)) {
            return response()->json(['code' => 'idempotency_conflict', 'message' => 'Review the original immutable attempt.', 'next_action' => 'review_original_attempt'], 409);
        }

        return response()->json($this->snapshot($stored), $stored->http_status);
    }

    /** Caller must hold current original-scope access, including relevant duty.
     * @param  array<string, string>  $selector
     */
    public function lookup(string $chapter, array $selector, string $actor): JsonResponse
    {
        $query = DB::table('chapter_operations')->where('chapter_id', $chapter)->where('actor_user_id', $actor);
        foreach ($selector as $key => $value) {
            $query->where($key, $value);
        }
        $stored = $query->first();
        if ($stored !== null) {
            return response()->json($this->snapshot($stored));
        }

        return response()->json(['schema_version' => '1.0', 'chapter_id' => $chapter, 'action_result' => 'uncertain',
            'operation' => ['identity' => ['operation_id' => $selector['public_id'] ?? null,
                'action_code' => $selector['action_code'] ?? null, 'idempotency_key' => $selector['idempotency_key'] ?? null],
                'outcome' => 'unknown', 'committed_at' => null, 'replayed' => false], 'record' => null, 'field_feedback' => [],
            'blocking_reason' => ['code' => 'NO_VISIBLE_TERMINAL_RESULT', 'message' => 'Original outcome is not confirmed. Preserve the original attempt.'],
            'permitted_next_actions' => [['code' => 'lookup_operation', 'label' => 'Check original scope after current access review']],
            'input_policy' => 'preserve', 'lookup_state' => 'pending_or_not_visible']);
    }

    /** @return array<string, mixed> */
    private function snapshot(object $stored): array
    {
        $result = json_decode($stored->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        $result['operation']['replayed'] = true;

        return $result;
    }

    /** Called only in the owning guarded resource transaction.
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $result
     */
    public function record(string $chapter, string $fingerprint, array $actor, ?object $before, array $result, int $status, ?\stdClass $input = null): void
    {
        DB::table('chapter_operations')->insert([
            'public_id' => $result['operation']['identity']['operation_id'], 'chapter_id' => $chapter,
            'actor_user_id' => $actor['user_id'], 'actor_membership_id' => $actor['membership_id'],
            'action_code' => $result['operation']['identity']['action_code'],
            'idempotency_key' => $result['operation']['identity']['idempotency_key'], 'payload_hash' => $fingerprint,
            'input_schema' => match ($result['operation']['identity']['action_code']) {
                'duty_grants.authorize' => 'AuthorizeDutyGrantRequest',
                'memberships.authorize' => 'AuthorizeMembershipRequest',
                default => 'EndMembershipRequest',
            }.'@p02.09-review.1',
            'actor_snapshot' => json_encode($actor, JSON_THROW_ON_ERROR),
            'input_snapshot' => $input === null ? null : json_encode($input, JSON_THROW_ON_ERROR),
            'before_snapshot' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
            'result_snapshot' => json_encode($result, JSON_THROW_ON_ERROR), 'http_status' => $status,
            'committed_at' => Carbon::parse($result['operation']['committed_at'])->format('Y-m-d H:i:s.u'),
        ]);
    }
}
