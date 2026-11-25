<?php

namespace App\Console\Commands;

use App\Models\DutyGrant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SetDutyCommand extends BaseControlledCommand
{
    protected $signature = 'app:set-duty
                            {--payload= : JSON payload conforming to SetDutyProcedure}
                            {--file= : Path to JSON file}
                            {--chapter-id= : Chapter UUID}
                            {--user-id= : User UUID}
                            {--duty= : Duty code (e.g. INVENTORY_CUSTODIAN)}
                            {--status= : Duty status (active/revoked)}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target Duty Grant UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: setDuty (GOV-03)';

    public function handle(): int
    {
        $payload = $this->parsePayload('setDuty');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $chapterId = $payload['chapter_id'] ?? $this->option('chapter-id') ?? (string) Str::uuid();
        $duty = $payload['input']['duty'] ?? $this->option('duty') ?? 'INVENTORY';
        $status = $payload['input']['status'] ?? $this->option('status') ?? 'active';
        $scope = $payload['input']['scope'] ?? null;
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'setDuty')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));

            return 0;
        }

        $newVersion = $expectedVersion + 1;
        $userId = $payload['input']['user_id'] ?? $this->option('user-id') ?? $operatorId;

        $result = DB::transaction(function () use ($targetId, $chapterId, $userId, $status, $newVersion, $actionKey, $operatorId, $scope, $payload, $duty) {
            User::whereIn('id', array_filter([(string) $userId]))->orderBy('id')->lockForUpdate()->get();

            DutyGrant::updateOrCreate(
                ['id' => $targetId],
                [
                    'chapter_id' => $chapterId,
                    'user_id' => $userId,
                    'duty_code' => $duty,
                    'status' => $status,
                    'is_alternate' => false,
                    'scope' => $scope,
                    'valid_from' => $payload['input']['effective_from'] ?? now(),
                    'valid_until' => $payload['input']['effective_until'] ?? null,
                    'version' => $newVersion,
                ]
            );

            return $this->commitResult(
                procedureId: 'setDuty',
                actionKey: $actionKey,
                targetId: $targetId,
                version: $newVersion,
                sessionEffect: 'recheck_authority',
                chapterId: $chapterId,
                operatorId: $operatorId,
                details: ['duty' => $duty, 'status' => $status]
            );
        });

        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
