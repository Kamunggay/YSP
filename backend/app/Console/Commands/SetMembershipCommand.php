<?php

namespace App\Console\Commands;

use App\Models\ChapterMembership;
use Illuminate\Support\Str;

class SetMembershipCommand extends BaseControlledCommand
{
    protected $signature = 'app:set-membership
                            {--payload= : JSON payload conforming to SetMembershipProcedure}
                            {--file= : Path to JSON file}
                            {--chapter-id= : Chapter UUID}
                            {--user-id= : User UUID}
                            {--status= : Membership status (active/suspended)}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target Membership UUID}
                            {--expected-version= : Expected version integer}';

    protected $description = 'Controlled procedure: setMembership (GOV-02)';

    public function handle(): int
    {
        $payload = $this->parsePayload('setMembership');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $chapterId = $payload['chapter_id'] ?? $this->option('chapter-id') ?? (string) Str::uuid();
        $userId = $payload['input']['user_id'] ?? $this->option('user-id') ?? (string) Str::uuid();
        $status = $payload['input']['status'] ?? $this->option('status') ?? 'active';
        $expectedVersion = (int) ($payload['expected_version'] ?? $this->option('expected-version') ?? 1);

        if ($replayed = $this->checkReplay($actionKey, 'setMembership')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));
            return 0;
        }

        $newVersion = $expectedVersion + 1;
        ChapterMembership::updateOrCreate(
            ['id' => $targetId],
            [
                'chapter_id' => $chapterId,
                'user_id' => $userId,
                'membership_status' => $status,
                'version' => $newVersion,
            ]
        );

        $result = $this->commitResult(
            procedureId: 'setMembership',
            actionKey: $actionKey,
            targetId: $targetId,
            version: $newVersion,
            sessionEffect: 'recheck_authority',
            chapterId: $chapterId,
            operatorId: $operatorId,
            details: ['user_id' => $userId, 'status' => $status]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));
        return 0;
    }
}
