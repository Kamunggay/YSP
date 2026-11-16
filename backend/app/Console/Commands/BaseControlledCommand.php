<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\IdempotencyRecord;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

abstract class BaseControlledCommand extends Command
{
    protected function parsePayload(string $procedureId): array
    {
        $payloadRaw = $this->option('payload');
        if ($payloadRaw) {
            $data = json_decode($payloadRaw, true);
            if (is_array($data)) {
                return $data;
            }
        }

        $filePath = $this->option('file');
        if ($filePath && file_exists($filePath)) {
            $data = json_decode(file_get_contents($filePath), true);
            if (is_array($data)) {
                return $data;
            }
        }

        return [];
    }

    protected function checkReplay(string $actionKey, string $procedureId): ?array
    {
        $existing = IdempotencyRecord::where('key', $actionKey)->first();
        if ($existing) {
            $decoded = json_decode($existing->response_body, true);
            if (is_array($decoded)) {
                $decoded['outcome'] = 'replayed';
                return $decoded;
            }
        }
        return null;
    }

    protected function commitResult(
        string $procedureId,
        string $actionKey,
        string $targetId,
        int $version,
        string $sessionEffect,
        ?string $chapterId = null,
        ?string $operatorId = null,
        array $details = []
    ): array {
        $auditId = (string) Str::uuid();

        AuditLog::create([
            'id' => $auditId,
            'chapter_id' => $chapterId,
            'user_id' => $operatorId,
            'action' => "controlled:{$procedureId}",
            'entity_type' => $procedureId,
            'entity_id' => $targetId,
            'details' => $details,
        ]);

        $result = [
            'outcome' => 'committed',
            'procedure_id' => $procedureId,
            'action_key' => $actionKey,
            'target_id' => $targetId,
            'version' => $version,
            'audit_id' => $auditId,
            'committed_at' => now()->toIso8601ZuluString(),
            'session_effect' => $sessionEffect,
        ];

        IdempotencyRecord::create([
            'id' => (string) Str::uuid(),
            'key' => $actionKey,
            'chapter_id' => $chapterId,
            'user_id' => $operatorId,
            'payload_hash' => hash('sha256', json_encode($details)),
            'response_code' => 200,
            'response_body' => json_encode($result),
            'expires_at' => now()->addDays(30),
        ]);

        return $result;
    }
}
