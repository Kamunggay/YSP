<?php

namespace App\Services\Shared;

use App\Exceptions\ContractException;
use App\Models\Chapter;
use App\Models\PolicyRecord;
use App\Models\ReferenceSequence;
use App\Services\Authority\ChapterAuthority;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReferenceSequenceService
{
    public const NUMBERED_SERIES_SCHEMAS = [
        'RF' => 'RfReferenceSeriesPolicyValue',
        'IS_AR' => 'IssueReferenceSeriesPolicyValue',
        'REPF' => 'RepfReferenceSeriesPolicyValue',
        'PO' => 'PoReferenceSeriesPolicyValue',
        'DA' => 'DaReferenceSeriesPolicyValue',
    ];

    private const STAGE_2_SERIES = ['REPF', 'PO', 'DA'];

    /**
     * Allocate a strictly monotonic, non-reusable reference number scoped by
     * chapter, document_kind (IPC|RM|RF|IS_AR|REPF|PO|DA), and Asia/Manila sequence year.
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

            $coordinate = ['chapter_id' => $chapterId, 'document_kind' => $documentKind, 'sequence_year' => $year];
            ReferenceSequence::upsert([$coordinate + [
                'id' => (string) Str::uuid(),
                'prefix' => $prefix,
                'last_sequence' => 0,
                'sequence_width' => $effectiveWidth,
            ]], array_keys($coordinate), ['sequence_year']);
            $sequenceRow = ReferenceSequence::where($coordinate)->lockForUpdate()->firstOrFail();

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
     * Resolve an approved series. Stage 2 numbering requires a current policy.
     * PO-RM and DA-RM callers resolve 'RM' with $required before allocating the shared counter.
     *
     * @return array{prefix: string, width: ?int, policy_id: ?string, policy_version: ?int}
     */
    public function resolveSeriesPolicy(string $chapterId, string $documentKind, bool $required = false): array
    {
        $required = $required || in_array($documentKind, self::STAGE_2_SERIES, true);
        $schema = in_array($documentKind, ['IPC', 'RM'], true)
            ? 'OpeningReferencePolicyValue'
            : (self::NUMBERED_SERIES_SCHEMAS[$documentKind] ?? null);
        $at = now();
        $now = $at->format('Y-m-d H:i:s.u');
        $query = PolicyRecord::where('chapter_id', $chapterId)->where('policy_code', 'reference_series');
        if (! $required) {
            $query->where(fn ($q) => $q->whereNull('effective_from')->orWhere('effective_from', '<=', $now))
                ->where(fn ($q) => $q->whereNull('effective_until')->orWhere('effective_until', '>', $now));
        }
        $policies = $query->orderBy('id')->sharedLock()->get()->sortByDesc('policy_version');
        if ($schema && $approved = $policies->first(function (PolicyRecord $row) use ($schema, $required, $at) {
            if ($required) {
                return ChapterAuthority::policyState($row, 'CHAPTER_HEAD', $schema, at: $at) === 'effective';
            }

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

        if ($required && $schema === null) {
            throw new \InvalidArgumentException('Unknown required reference series.');
        }

        if ($required) {
            $blocker = ChapterAuthority::policyBlocker($policies, 'reference_series', 'CHAPTER_HEAD', $schema, at: $at);
            throw new ContractException(409, 'setup_blocked', 'Current approved setup is required for this action.', [
                'error' => [
                    'code' => 'setup_blocked', 'message' => 'Current approved setup is required for this action.',
                    'blockers' => [$blocker],
                ],
            ]);
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
