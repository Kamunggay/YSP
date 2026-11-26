<?php

namespace App\Services\Shared;

use App\Models\Chapter;
use App\Models\PolicyRecord;
use App\Models\ReferenceSequence;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReferenceSequenceService
{
    /**
     * Allocate a strictly monotonic, non-reusable reference number scoped by
     * chapter, document_kind (IPC|RM|RF|IS_AR), and Asia/Manila sequence year.
     *
     * @param  ?array{prefix: string, width: ?int, policy_id: ?string, policy_version: ?int}  $policyOverride
     * @return array{reference: string, sequence: int, year: int, prefix: string, policy_id: ?string, policy_version: ?int}
     */
    public function nextReference(string $chapterId, string $documentKind, int $width = 6, ?array $policyOverride = null): array
    {
        $run = function () use ($chapterId, $documentKind, $width, $policyOverride): array {
            $year = now('Asia/Manila')->year;
            $policy = $policyOverride ?? $this->resolveSeriesPolicy($chapterId, $documentKind);
            $prefix = $policy['prefix'];
            $effectiveWidth = $policy['width'] ?? $width;

            $sequenceRow = ReferenceSequence::where('chapter_id', $chapterId)
                ->where('document_kind', $documentKind)
                ->where('sequence_year', $year)
                ->lockForUpdate()
                ->first();

            if (! $sequenceRow) {
                $sequenceRow = ReferenceSequence::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'document_kind' => $documentKind,
                    'sequence_year' => $year,
                    'prefix' => $prefix,
                    'last_sequence' => 0,
                    'sequence_width' => $effectiveWidth,
                ]);
                // Re-lock newly created row under the active transaction
                $sequenceRow = ReferenceSequence::where('id', $sequenceRow->id)
                    ->lockForUpdate()
                    ->firstOrFail();
            }

            $nextSeq = (int) $sequenceRow->last_sequence + 1;
            $sequenceRow->last_sequence = $nextSeq;
            $sequenceRow->save();

            $width = $policy['policy_id'] ? $effectiveWidth : (int) $sequenceRow->sequence_width;
            $padded = str_pad((string) $nextSeq, $width, '0', STR_PAD_LEFT);
            $effectivePrefix = $policy['policy_id'] ? $prefix : ($sequenceRow->prefix ?: $prefix);

            if (str_contains($effectivePrefix, '{YEAR}')) {
                $reference = str_replace('{YEAR}', (string) $year, $effectivePrefix).$padded;
            } else {
                $reference = "{$effectivePrefix}-{$year}-{$padded}";
            }

            return [
                'reference' => $reference,
                'sequence' => $nextSeq,
                'year' => $year,
                'prefix' => $effectivePrefix,
                'policy_id' => $policy['policy_id'],
                'policy_version' => $policy['policy_version'],
            ];
        };

        if (DB::transactionLevel() > 0) {
            return $run();
        }

        return DB::transaction($run);
    }

    /**
     * Resolve chapter reference series policy if present, else compute deterministic chapter code prefix.
     *
     * @return array{prefix: string, width: ?int, policy_id: ?string, policy_version: ?int}
     */
    public function resolveSeriesPolicy(string $chapterId, string $documentKind): array
    {
        $now = now()->format('Y-m-d H:i:s.u');
        $policies = PolicyRecord::where('chapter_id', $chapterId)
            ->where('policy_code', 'reference_series')
            ->where(function ($q) use ($now) {
                $q->whereNull('effective_from')->orWhere('effective_from', '<=', $now);
            })
            ->where(function ($q) use ($now) {
                $q->whereNull('effective_until')->orWhere('effective_until', '>', $now);
            })
            ->orderByDesc('policy_version')->orderBy('id')->sharedLock()->get();
        $schema = match ($documentKind) {
            'IPC', 'RM' => 'OpeningReferencePolicyValue',
            'RF' => 'RfReferenceSeriesPolicyValue',
            'IS_AR' => 'IssueReferenceSeriesPolicyValue',
            default => null,
        };
        if ($schema && $approved = $policies->first(function (PolicyRecord $row) use ($schema) {
            $evidence = $row->setupEvidence();

            return ($evidence['value_schema_reference'] ?? null) === '#/components/schemas/'.$schema
                && ($evidence['subject_id'] ?? null) === null
                && collect($evidence['approvals'] ?? [])->contains('authority', 'CHAPTER_HEAD');
        })) {
            $value = $approved->rules_json;

            return [
                'prefix' => rtrim($value[match ($documentKind) {
                    'IPC' => 'ipc_prefix', 'RM' => 'rm_prefix', default => 'prefix',
                }], '-'),
                'width' => $value['minimum_digits'] ?? $value['sequence_width'],
                'policy_id' => $approved->aggregate_id ?? $approved->id,
                'policy_version' => (int) $approved->policy_version,
            ];
        }

        $policy = $policies->first(fn (PolicyRecord $row) => $row->aggregate_id === null
            && ! isset($row->setupEvidence()['value_schema_reference']));
        $chapter = Chapter::where('id', $chapterId)->orWhere('code', $chapterId)->first();
        $chapterCode = $chapter?->code ?? 'CHAP';
        $shortCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', str_replace('SYN-', '', $chapterCode)));
        if ($shortCode === '') {
            $shortCode = 'CHAP';
        }
        $shortPrefix = substr($shortCode, 0, 6);

        $defaultPrefix = match ($documentKind) {
            'IS_AR' => "{$shortPrefix}ISAR",
            'RF' => "{$shortPrefix}-RF",
            'IPC' => "{$shortPrefix}-IPC",
            'RM' => "{$shortPrefix}-RM",
            default => "{$shortPrefix}-{$documentKind}",
        };

        if (! $policy) {
            return [
                'prefix' => $defaultPrefix,
                'width' => null,
                'policy_id' => null,
                'policy_version' => null,
            ];
        }

        $rules = is_array($policy->rules_json) ? $policy->rules_json : [];
        $seriesConfig = $rules['series'][$documentKind] ?? $rules[$documentKind] ?? null;

        $prefix = $defaultPrefix;
        $width = null;
        if (is_string($seriesConfig) && $seriesConfig !== '') {
            $prefix = rtrim($seriesConfig, '-');
        } elseif (is_array($seriesConfig)) {
            if (! empty($seriesConfig['prefix'])) {
                $prefix = rtrim((string) $seriesConfig['prefix'], '-');
            }
            if (! empty($seriesConfig['width'])) {
                $width = (int) $seriesConfig['width'];
            }
        } elseif (! empty($rules['prefix'])) {
            $prefix = rtrim((string) $rules['prefix'], '-')."-{$documentKind}";
        }

        return [
            'prefix' => $prefix,
            'width' => $width,
            'policy_id' => $policy->id,
            'policy_version' => (int) $policy->policy_version,
        ];
    }
}
