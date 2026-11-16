<?php

namespace App\Console\Commands;

use App\Models\PolicyRecord;
use Illuminate\Support\Str;

class RecordPolicyCommand extends BaseControlledCommand
{
    protected $signature = 'app:record-policy
                            {--payload= : JSON payload conforming to RecordPolicyProcedure}
                            {--file= : Path to JSON file}
                            {--chapter-id= : Chapter UUID}
                            {--setting-key= : Policy key (e.g. rf_approval_route)}
                            {--value= : Policy JSON value}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target Policy UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: recordPolicy (GOV-08, GOV-09, MIG-01)';

    public function handle(): int
    {
        $payload = $this->parsePayload('recordPolicy');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $chapterId = $payload['chapter_id'] ?? $this->option('chapter-id') ?? (string) Str::uuid();
        $settingKey = $payload['input']['setting_key'] ?? $this->option('setting-key') ?? 'rop_limits';
        $value = $payload['input']['value'] ?? $this->option('value') ?? '{}';
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'recordPolicy')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));
            return 0;
        }

        $newVersion = $expectedVersion + 1;
        $rulesJson = is_string($value) ? (json_decode($value, true) ?: ['raw' => $value]) : $value;

        PolicyRecord::updateOrCreate(
            ['id' => $targetId],
            [
                'chapter_id' => $chapterId,
                'policy_code' => $settingKey,
                'policy_version' => $newVersion,
                'rules_json' => $rulesJson,
                'effective_from' => $payload['input']['effective_from'] ?? now(),
                'effective_until' => $payload['input']['effective_until'] ?? null,
            ]
        );

        $result = $this->commitResult(
            procedureId: 'recordPolicy',
            actionKey: $actionKey,
            targetId: $targetId,
            version: $newVersion,
            sessionEffect: 'recheck_authority',
            chapterId: $chapterId,
            operatorId: $operatorId,
            details: ['setting_key' => $settingKey]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));
        return 0;
    }
}
