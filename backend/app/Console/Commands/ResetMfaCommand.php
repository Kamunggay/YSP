<?php

namespace App\Console\Commands;

use App\Models\UserMfaCredential;
use Illuminate\Support\Str;

class ResetMfaCommand extends BaseControlledCommand
{
    protected $signature = 'app:reset-mfa
                            {--payload= : JSON payload conforming to ResetMfaProcedure}
                            {--file= : Path to JSON file}
                            {--reason= : Reason for MFA reset}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target User UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: resetMfa (SEC-03)';

    public function handle(): int
    {
        $payload = $this->parsePayload('resetMfa');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'resetMfa')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));

            return 0;
        }

        $newVersion = $expectedVersion + 1;
        $mfa = UserMfaCredential::where('user_id', $targetId)->first();
        if ($mfa) {
            $mfa->update([
                'is_confirmed' => false,
                'recovery_codes' => null,
                'version' => $newVersion,
            ]);
        }

        $result = $this->commitResult(
            procedureId: 'resetMfa',
            actionKey: $actionKey,
            targetId: $targetId,
            version: $newVersion,
            sessionEffect: 'require_reenrollment',
            chapterId: null,
            operatorId: $operatorId,
            details: ['target_id' => $targetId]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
