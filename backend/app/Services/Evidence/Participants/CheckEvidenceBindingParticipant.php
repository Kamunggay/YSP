<?php

namespace App\Services\Evidence\Participants;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Shared\CanonicalJson;
use DomainException;
use Illuminate\Support\Str;

class CheckEvidenceBindingParticipant
{
    public function __construct(private PaperEvidenceStore $store) {}

    /**
     * The caller holds current authority and the target lock and supplies a domain-validated acknowledgment.
     */
    private function checkExact(array $input): array
    {
        $required = $input['required_bytes'];
        $snapshot = $input['snapshot'];
        $acknowledgment = $input['acknowledgment'];
        if (! is_array($required) || ! is_string($required['evidence_id'] ?? null)
            || ! preg_match(AuthInput::UUID, $required['evidence_id'])) {
            return ['outcome' => 'missing', 'reason' => 'evidence_missing'];
        }
        $record = EvidenceRecord::where('chapter_id', $input['chapter_id'])
            ->whereKey($required['evidence_id'] ?? null)->sharedLock()->first();
        if (! $record) {
            return ['outcome' => 'missing', 'reason' => 'evidence_missing'];
        }
        if ($acknowledgment === null) {
            return ['outcome' => 'missing', 'reason' => 'acknowledgment_missing'];
        }

        $versionId = $required['version_id'] ?? null;
        if (! is_string($versionId) || ! preg_match(AuthInput::UUID, $versionId)) {
            return ['outcome' => 'mismatched', 'reason' => 'bytes_changed'];
        }
        $blobs = $record->exactVersion($versionId);

        [, $reason] = $this->store->checkVersion($blobs);
        if ($reason !== null) {
            return ['outcome' => 'invalid', 'reason' => $reason];
        }
        $targetMatches = $record->purpose === ($snapshot['target']['purpose'] ?? null)
            && $record->record_id === ($snapshot['target']['record_id'] ?? null);
        if (! $targetMatches) {
            return ['outcome' => 'mismatched', 'reason' => 'target_mismatch'];
        }

        $current = $record->currentVersionBlob();
        if ($blobs->isNotEmpty() && $current && $record->versionId($current) !== $versionId) {
            return ['outcome' => 'mismatched', 'reason' => 'superseded_version'];
        }

        $binding = [
            'evidence_id' => $record->id,
            'version_id' => $versionId,
            'attachments' => $blobs->map(fn (EvidenceBlob $blob) => ['attachment_id' => $blob->id, 'sha256' => $blob->sha256_hash])->all(),
        ];
        if ($blobs->isEmpty() || CanonicalJson::encode($binding) !== CanonicalJson::encode($required)
            || CanonicalJson::encode($binding) !== CanonicalJson::encode($acknowledgment['bytes'] ?? null)) {
            return ['outcome' => 'mismatched', 'reason' => 'bytes_changed'];
        }
        if (CanonicalJson::encode($snapshot) !== CanonicalJson::encode($acknowledgment['snapshot'] ?? null)) {
            return ['outcome' => 'mismatched', 'reason' => 'snapshot_changed'];
        }
        if (empty($acknowledgment['acknowledgment_id']) || empty($acknowledgment['matched_by'])
            || empty($acknowledgment['matched_at']) || empty($acknowledgment['acknowledged_at'])
            || ($record->purpose === 'actual_issue' && empty($acknowledgment['recipient_id']))) {
            return ['outcome' => 'mismatched', 'reason' => 'acknowledgment_invalid'];
        }

        return ['outcome' => 'ready', 'binding' => $binding, 'snapshot' => $snapshot, 'acknowledgment_id' => $acknowledgment['acknowledgment_id']];
    }

    public function recordMatch(string $chapterId, string $actorId, array $snapshot, array $bytes, ?string $recipientId, string $recipientName, string $acknowledgedAt, array $current): EvidenceBinding
    {
        $id = $bytes['evidence_id'] ?? null;
        if (is_string($id) && preg_match(AuthInput::UUID, $id)
            && ! EvidenceRecord::where('chapter_id', $chapterId)->whereKey($id)
                ->where('purpose', $snapshot['target']['purpose'])->where('record_id', $snapshot['target']['record_id'])
                ->sharedLock()->first(['id'])) {
            $this->verifyMatch($chapterId, $actorId, $snapshot, null, null, $current);
        }

        $acknowledgment = [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $actorId,
            'matched_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'recipient_id' => $recipientId,
            'acknowledged_at' => $acknowledgedAt,
            'snapshot' => $snapshot,
            'bytes' => $bytes,
        ];
        $this->verifyMatch($chapterId, $actorId, $snapshot, $bytes, $acknowledgment, $current);

        return EvidenceBinding::create([
            'id' => $acknowledgment['acknowledgment_id'],
            'chapter_id' => $chapterId,
            'evidence_id' => $bytes['evidence_id'],
            'blob_id' => $bytes['attachments'][0]['attachment_id'],
            'source_type' => $snapshot['target']['purpose'],
            'source_id' => $snapshot['target']['record_id'],
            'recipient_name' => $recipientName,
            'item_fingerprint' => $snapshot['sha256'],
            'match_projection' => $acknowledgment,
            'created_at' => now(),
            'status' => 'active',
        ]);
    }

    public function verifyMatch(string $chapterId, string $actorId, array $snapshot, ?array $bytes, ?array $acknowledgment, array $current): void
    {
        try {
            $result = $this->check([
                'chapter_id' => $chapterId, 'actor_id' => $actorId, 'snapshot' => $snapshot,
                'required_bytes' => $bytes, 'acknowledgment' => $acknowledgment,
            ]);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 503) {
                throw $exception;
            }

            throw new ContractException(503, 'unavailable', 'Signed paper verification is temporarily unavailable.');
        }
        if ($result['outcome'] !== 'ready') {
            $code = match ($result['outcome']) {
                'invalid' => 'evidence_invalid',
                'missing' => $result['reason'] === 'evidence_missing' || $snapshot['target']['purpose'] === 'hold_clearance'
                    ? 'evidence_missing' : 'acknowledgment_missing',
                default => 'evidence_mismatch',
            };
            throw new ContractException(409, $code, 'The exact signed paper must match the current material.',
                $snapshot['target']['purpose'] === 'opening_receipt' ? [] : [
                    'failed_intent_committed' => false, 'current' => $current, 'setup_blockers' => [],
                ],
            );
        }
    }

    /**
     * Check evidence binding against source, recipient, and batch lines.
     *
     * @param  array{
     *     chapter_id: string,
     *     evidence_id?: ?string,
     *     binding_id?: ?string,
     *     acknowledgment_binding_id?: ?string,
     *     source_type: string,
     *     source_id: string,
     *     recipient_name: string,
     *     lines: array
     * }  $input
     * @return array{
     *     outcome: string,
     *     binding?: EvidenceBinding,
     *     snapshot?: array,
     *     acknowledgment_id?: string,
     *     reason?: string
     * }
     *
     * @throws DomainException
     */
    public function check(array $input, bool $strict = true): array
    {
        if (array_key_exists('required_bytes', $input)) {
            return $this->checkExact($input);
        }

        $chapterId = (string) ($input['chapter_id'] ?? '');
        $evidenceId = $input['evidence_id'] ?? null;
        $bindingId = $input['binding_id'] ?? $input['acknowledgment_binding_id'] ?? null;
        $sourceType = (string) ($input['source_type'] ?? '');
        $sourceId = (string) ($input['source_id'] ?? '');
        $recipientName = (string) ($input['recipient_name'] ?? '');
        $lines = (array) ($input['lines'] ?? []);

        // Resolve binding if binding_id is supplied
        $binding = null;
        if ($bindingId) {
            $binding = EvidenceBinding::where('id', $bindingId)
                ->where('chapter_id', $chapterId)
                ->first();

            if ($binding && empty($evidenceId)) {
                $evidenceId = $binding->evidence_id;
            }
        }

        // Validate evidence record
        if (empty($evidenceId)) {
            if ($strict) {
                throw new DomainException('Evidence ID is required for evidence binding verification.');
            }

            return ['outcome' => 'missing', 'reason' => 'evidence_missing'];
        }

        $evidenceRecord = EvidenceRecord::where('id', $evidenceId)->first();
        if (! $evidenceRecord || $evidenceRecord->chapter_id !== $chapterId) {
            if ($strict) {
                throw new DomainException("Evidence record '{$evidenceId}' does not exist or does not belong to chapter '{$chapterId}'.");
            }

            return ['outcome' => 'missing', 'reason' => 'evidence_missing'];
        }

        if ($evidenceRecord->technical_state !== 'ready') {
            if ($strict) {
                $reason = $evidenceRecord->invalid_reason ?? 'Technical state is not ready';
                throw new DomainException("Evidence record '{$evidenceId}' is invalid ({$reason}).");
            }

            return ['outcome' => 'invalid', 'reason' => 'unsafe_content'];
        }

        // Look up binding for evidence record if not already resolved
        if (! $binding && ! $bindingId) {
            $binding = EvidenceBinding::where('chapter_id', $chapterId)
                ->where('evidence_id', $evidenceId)
                ->latest('created_at')
                ->first();
        }

        if (! $binding) {
            if ($strict) {
                throw new DomainException("No evidence binding found for evidence record '{$evidenceId}'.");
            }

            return ['outcome' => 'missing', 'reason' => 'acknowledgment_missing'];
        }

        if ($binding->evidence_id !== $evidenceId || $evidenceRecord->record_id !== null) {
            if ($strict) {
                throw new DomainException('An exact current evidence match is required.');
            }

            return ['outcome' => 'mismatched', 'reason' => 'bytes_changed'];
        }

        if (($binding->status ?? 'active') === 'invalidated') {
            if ($strict) {
                throw new DomainException("Evidence binding '{$binding->id}' has been invalidated after material revision.");
            }

            return ['outcome' => 'mismatched', 'reason' => 'snapshot_changed'];
        }

        if (! empty($sourceType) && $binding->source_type !== $sourceType) {
            if ($strict) {
                throw new DomainException("Evidence binding source_type mismatch: expected '{$binding->source_type}', got '{$sourceType}'.");
            }

            return ['outcome' => 'mismatched', 'reason' => 'target_mismatch'];
        }

        if (! empty($sourceId) && $binding->source_id !== $sourceId) {
            if ($strict) {
                throw new DomainException("Evidence binding source_id mismatch: expected '{$binding->source_id}', got '{$sourceId}'.");
            }

            return ['outcome' => 'mismatched', 'reason' => 'target_mismatch'];
        }

        // Validate recipient match
        if ($binding->recipient_name !== $recipientName) {
            if ($strict) {
                throw new DomainException(
                    "Evidence binding recipient mismatch: expected '{$binding->recipient_name}', got '{$recipientName}'."
                );
            }

            return ['outcome' => 'mismatched', 'reason' => 'target_mismatch'];
        }

        // Compute batch fingerprint of sorted tuple
        $effectiveSourceType = ! empty($sourceType) ? $sourceType : $binding->source_type;
        $effectiveSourceId = ! empty($sourceId) ? $sourceId : $binding->source_id;

        $computedFingerprint = $this->computeBatchFingerprint(
            $effectiveSourceType,
            $effectiveSourceId,
            $recipientName,
            $lines
        );

        if ($binding->item_fingerprint !== $computedFingerprint) {
            if ($strict) {
                throw new DomainException(
                    'Evidence binding fingerprint mismatch: batch contents, variants, or quantities have changed from signed paper evidence.'
                );
            }

            return ['outcome' => 'mismatched', 'reason' => 'snapshot_changed'];
        }

        return [
            'outcome' => 'ready',
            'binding' => $binding,
            'snapshot' => [
                'fingerprint' => $computedFingerprint,
                'recipient_name' => $recipientName,
                'evidence_id' => $evidenceId,
            ],
            'acknowledgment_id' => $binding->id,
        ];
    }

    /**
     * Create or update evidence binding with computed batch fingerprint.
     */
    public function createOrUpdateBinding(
        string $chapterId,
        string $evidenceId,
        string $blobId,
        string $sourceType,
        string $sourceId,
        string $recipientName,
        array $lines
    ): EvidenceBinding {
        $evidenceRecord = EvidenceRecord::where('id', $evidenceId)
            ->where('chapter_id', $chapterId)
            ->first();

        if (! $evidenceRecord) {
            throw new DomainException("Evidence record '{$evidenceId}' not found for chapter '{$chapterId}'.");
        }

        if (empty($blobId)) {
            $blob = EvidenceBlob::where('evidence_id', $evidenceId)->latest('version')->first();
            $blobId = $blob ? $blob->id : (string) Str::uuid();
        }

        $fingerprint = $this->computeBatchFingerprint($sourceType, $sourceId, $recipientName, $lines);

        $binding = EvidenceBinding::where('chapter_id', $chapterId)
            ->where('evidence_id', $evidenceId)
            ->first();

        if (! $binding) {
            $binding = new EvidenceBinding;
            $binding->id = (string) Str::uuid();
            $binding->chapter_id = $chapterId;
            $binding->evidence_id = $evidenceId;
            $binding->created_at = now();
        }

        $binding->blob_id = $blobId;
        $binding->source_type = $sourceType;
        $binding->source_id = $sourceId;
        $binding->recipient_name = $recipientName;
        $binding->item_fingerprint = $fingerprint;
        $binding->status = 'active';
        $binding->save();

        return $binding;
    }

    /**
     * Compute authoritative batch fingerprint of sorted tuple:
     * sha256(source_type . '|' . source_id . '|' . recipient_name . '|' . json_encode(sorted [variant_id, unit_id, quantity]))
     */
    public function computeBatchFingerprint(
        string $sourceType,
        string $sourceId,
        string $recipientName,
        array $lines
    ): string {
        $normalizedLines = [];
        foreach ($lines as $line) {
            $normalizedLines[] = [
                'variant_id' => (string) ($line['variant_id'] ?? $line['source_line_id'] ?? ''),
                'unit_id' => (string) ($line['unit_id'] ?? ''),
                'quantity' => (float) ($line['quantity'] ?? $line['actual_quantity'] ?? $line['issued_quantity'] ?? 0),
            ];
        }

        usort($normalizedLines, function ($a, $b) {
            $cmp = strcmp($a['variant_id'], $b['variant_id']);
            if ($cmp !== 0) {
                return $cmp;
            }
            $cmp = strcmp($a['unit_id'], $b['unit_id']);
            if ($cmp !== 0) {
                return $cmp;
            }

            return $a['quantity'] <=> $b['quantity'];
        });

        $linesJson = json_encode(array_values($normalizedLines));

        return hash('sha256', "{$sourceType}|{$sourceId}|{$recipientName}|{$linesJson}");
    }
}
