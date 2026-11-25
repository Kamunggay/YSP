<?php

namespace App\Console\Commands;

use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SetAlternateCommand extends BaseControlledCommand
{
    protected $signature = 'app:set-alternate
                            {--payload= : JSON payload conforming to SetAlternateProcedure}
                            {--file= : Path to JSON file}
                            {--chapter-id= : Chapter UUID}
                            {--duty= : Duty code (e.g. INVENTORY)}
                            {--replaces-user-id= : Primary user UUID replaced}
                            {--status= : Alternate status (active/revoked)}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target Alternate Grant UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: setAlternate (GOV-04)';

    public function handle(): int
    {
        $payload = $this->parsePayload('setAlternate');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $chapterId = $payload['chapter_id'] ?? $this->option('chapter-id') ?? (string) Str::uuid();
        $duty = $payload['input']['duty'] ?? $this->option('duty') ?? 'INVENTORY';
        $status = $payload['input']['status'] ?? $this->option('status') ?? 'active';
        $replacesUserId = $payload['input']['replaces_user_id'] ?? $this->option('replaces-user-id');
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'setAlternate')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));

            return 0;
        }

        $newVersion = $expectedVersion + 1;
        $membershipId = $payload['input']['membership_id'] ?? null;
        $userId = $operatorId;
        if ($membershipId) {
            $membership = ChapterMembership::find($membershipId);
            if ($membership) {
                $userId = $membership->user_id;
            }
        }

        $result = DB::transaction(function () use ($targetId, $chapterId, $userId, $status, $newVersion, $actionKey, $operatorId, $payload, $duty, $replacesUserId) {
            User::whereIn('id', array_filter([(string) $userId, $replacesUserId]))->orderBy('id')->lockForUpdate()->get();

            DutyGrant::updateOrCreate(
                ['id' => $targetId],
                [
                    'chapter_id' => $chapterId,
                    'user_id' => $userId,
                    'duty_code' => $duty,
                    'status' => $status,
                    'is_alternate' => true,
                    'replaces_user_id' => $replacesUserId,
                    'scope' => $payload['input']['scope'] ?? null,
                    'valid_from' => $payload['input']['effective_from'] ?? now(),
                    'valid_until' => $payload['input']['effective_until'] ?? null,
                    'version' => $newVersion,
                ]
            );

            return $this->commitResult(
                procedureId: 'setAlternate',
                actionKey: $actionKey,
                targetId: $targetId,
                version: $newVersion,
                sessionEffect: 'recheck_authority',
                chapterId: $chapterId,
                operatorId: $operatorId,
                details: ['duty' => $duty, 'replaces_user_id' => $replacesUserId, 'status' => $status]
            );
        });

        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
