<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Support\Str;

class SetAccountStatusCommand extends BaseControlledCommand
{
    protected $signature = 'app:set-account-status
                            {--payload= : JSON payload conforming to SetAccountStatusProcedure}
                            {--file= : Path to JSON file}
                            {--status= : User status (enabled/disabled)}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target User UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: setAccountStatus (SEC-02)';

    public function handle(): int
    {
        $payload = $this->parsePayload('setAccountStatus');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id');
        $status = $payload['input']['status'] ?? $this->option('status') ?? 'disabled';
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'setAccountStatus')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));
            return 0;
        }

        $user = User::find($targetId);
        $newVersion = $expectedVersion + 1;
        if ($user) {
            $user->update([
                'status' => $status,
                'version' => $newVersion,
            ]);
        }

        $result = $this->commitResult(
            procedureId: 'setAccountStatus',
            actionKey: $actionKey,
            targetId: $targetId ?? (string) Str::uuid(),
            version: $newVersion,
            sessionEffect: 'revoke_all',
            chapterId: null,
            operatorId: $operatorId,
            details: ['status' => $status]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));
        return 0;
    }
}
