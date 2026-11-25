<?php

namespace App\Console\Commands;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use Illuminate\Support\Str;

class PrepareChapterCommand extends BaseControlledCommand
{
    protected $signature = 'app:prepare-chapter
                            {--payload= : JSON payload conforming to PrepareChapterProcedure}
                            {--file= : Path to JSON file}
                            {--reference= : Chapter code reference (e.g. SYN-A)}
                            {--display-name= : Chapter display name}
                            {--initial-head-user-id= : Initial Chapter Head User UUID}
                            {--action-key= : Action Key UUID}
                            {--operator-id= : Operator UUID}
                            {--target-id= : Target Chapter UUID}';

    protected $description = 'Controlled procedure: prepareChapter (GOV-01)';

    public function handle(): int
    {
        $payload = $this->parsePayload('prepareChapter');

        $actionKey = $payload['action_key'] ?? $this->option('action-key') ?? (string) Str::uuid();
        $operatorId = $payload['operator_id'] ?? $this->option('operator-id') ?? (string) Str::uuid();
        $targetId = $payload['target_id'] ?? $this->option('target-id') ?? (string) Str::uuid();
        $reference = $payload['input']['reference'] ?? $this->option('reference') ?? 'SYN-A';
        $displayName = $payload['input']['display_name'] ?? $this->option('display-name') ?? 'Synthetic chapter A';
        $headUserId = $payload['input']['initial_head_user_id'] ?? $this->option('initial-head-user-id');

        if ($replayed = $this->checkReplay($actionKey, 'prepareChapter')) {
            $this->line(json_encode($replayed, JSON_PRETTY_PRINT));

            return 0;
        }

        $chapter = Chapter::updateOrCreate(
            ['id' => $targetId],
            [
                'code' => $reference,
                'name' => $displayName,
                'status' => 'live',
                'version' => 1,
            ]
        );

        if ($headUserId) {
            $membershipId = (string) Str::uuid();
            ChapterMembership::updateOrCreate(
                ['chapter_id' => $targetId, 'user_id' => $headUserId],
                ['membership_status' => 'active', 'version' => 1]
            );

            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $targetId,
                'user_id' => $headUserId,
                'duty_code' => 'CHAPTER_HEAD',
                'status' => 'active',
                'is_alternate' => false,
                'valid_from' => now(),
            ]);
        }

        $result = $this->commitResult(
            procedureId: 'prepareChapter',
            actionKey: $actionKey,
            targetId: $targetId,
            version: 1,
            sessionEffect: 'none',
            chapterId: null,
            operatorId: $operatorId,
            details: ['reference' => $reference, 'display_name' => $displayName]
        );

        $this->line(json_encode($result, JSON_PRETTY_PRINT));

        return 0;
    }
}
