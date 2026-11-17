<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Support\Str;

class PrepareAccountCommand extends BaseControlledCommand
{
    protected $signature = 'app:prepare-account
                            {--payload= : JSON payload conforming to PrepareAccountProcedure}
                            {--file= : Path to JSON file}
                            {--login= : User login / email}
                            {--display-name= : User display name}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target User UUID}';

    protected $description = 'Controlled procedure: prepareAccount (SEC-01)';

    public function handle(): int
    {
        $payload = $this->parsePayload('prepareAccount');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $login = $payload['input']['login'] ?? $this->option('login') ?? 'officer@example.invalid';
        $displayName = $payload['input']['display_name'] ?? $this->option('display-name') ?? 'Synthetic officer';

        if ($replayed = $this->checkReplay($actionKey, 'prepareAccount')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));

            return 0;
        }

        $user = User::updateOrCreate(
            ['id' => $targetId],
            [
                'public_id' => $login,
                'name' => $displayName,
                'email' => $login,
                'password_hash' => hash('sha256', 'Password123!'),
                'status' => 'active',
                'version' => 1,
            ]
        );

        $result = $this->commitResult(
            procedureId: 'prepareAccount',
            actionKey: $actionKey,
            targetId: $targetId,
            version: 1,
            sessionEffect: 'none',
            chapterId: null,
            operatorId: $operatorId,
            details: ['login' => $login, 'display_name' => $displayName]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
