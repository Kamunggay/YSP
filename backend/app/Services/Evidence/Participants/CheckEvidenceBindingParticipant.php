<?php

namespace App\Services\Evidence\Participants;

use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use DomainException;
use Illuminate\Support\Str;

class CheckEvidenceBindingParticipant
{
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
        if (! $binding) {
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
