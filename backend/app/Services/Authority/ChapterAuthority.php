<?php

namespace App\Services\Authority;

use App\Exceptions\ContractException;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InternalRf;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Shared\ReferenceSequenceService;
use Brick\Math\BigDecimal;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class ChapterAuthority
{
    public const ACTION_DUTIES = [
        'rf.read' => ['COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY', 'DISPATCH'],
        'catalogue.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'COMMITTEE_REQUESTER', 'RF_APPROVER'],
        'catalogue.maintain' => ['INVENTORY'],
        'stock.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH'],
        'evidence.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'RF_APPROVER'],
        'evidence.prepare' => ['INVENTORY', 'RECEIVING', 'DISPATCH'],
        'ipc.draft' => ['INVENTORY'],
        'ipc.authorize' => ['CHAPTER_HEAD', 'FINANCE'],
        'opening_rm.prepare' => ['RECEIVING'],
        'opening_rm.post' => ['RECEIVING'],
        'rf.draft' => ['COMMITTEE_REQUESTER'],
        'rf.submit' => ['COMMITTEE_REQUESTER'],
        'rf.approve' => ['RF_APPROVER'],
        'rf.reserve' => ['INVENTORY'],
        'rf.reallocate' => ['INVENTORY'],
        'hold.place' => ['INVENTORY'],
        'hold.clear' => ['INVENTORY'],
        'issue.prepare' => ['INVENTORY', 'DISPATCH'],
        'issue.post' => ['INVENTORY', 'DISPATCH'],
        'history.read' => ['COMMITTEE_REQUESTER', 'INVENTORY', 'RECEIVING', 'DISPATCH', 'RF_APPROVER'],
        'ipc.read' => ['INVENTORY', 'INDEPENDENT_REVIEWER', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'ipc.count' => ['INVENTORY', 'INDEPENDENT_REVIEWER'],
        'opening_rm.read' => ['INVENTORY', 'RECEIVING'],
        'opening.result.read' => ['INVENTORY', 'INDEPENDENT_REVIEWER', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'replenishment.read' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'da.read' => ['INVENTORY', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'da.history_read' => ['INVENTORY', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'da.draft' => ['INVENTORY', 'RECEIVING'],
        'da.submit' => ['INVENTORY', 'RECEIVING'],
        'da.acknowledge' => ['INVENTORY', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'da.cancel' => ['INVENTORY', 'RECEIVING'],
        'da.restriction_resolve' => ['INVENTORY', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE'],
        'repf.read' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD', 'FINANCE', 'INDEPENDENT_REVIEWER'],
        'repf.draft' => ['INVENTORY', 'PURCHASING'],
        'repf.submit' => ['INVENTORY', 'PURCHASING'],
        'repf.budget_review' => ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'repf.cancel' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'quotation.read' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD', 'FINANCE', 'INDEPENDENT_REVIEWER'],
        'quotation.manage' => ['PURCHASING'],
        'quotation.select' => ['PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'po.read' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE', 'INDEPENDENT_REVIEWER'],
        'po.draft' => ['PURCHASING'],
        'po.submit' => ['PURCHASING'],
        'po.approve' => ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'po.acknowledge' => ['PURCHASING'],
        'po.amend_propose' => ['PURCHASING'],
        'po.amend_approve' => ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'po.close_short' => ['BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'po.cancel' => ['PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD'],
        'receiving.read' => ['RECEIVING', 'INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'CHAPTER_HEAD', 'FINANCE', 'INDEPENDENT_REVIEWER'],
        'receiving.draft' => ['RECEIVING', 'INVENTORY'],
        'receiving.inspect' => ['RECEIVING'],
        'receiving.match_evidence' => ['RECEIVING'],
        'receiving.post' => ['RECEIVING'],
        'receiving.cancel' => ['RECEIVING', 'CHAPTER_HEAD'],
        'discrepancy.manage' => ['RECEIVING', 'PURCHASING'],
        'discrepancy.resolve' => ['RECEIVING', 'PURCHASING', 'INVENTORY', 'CHAPTER_HEAD'],
        'receiving.hold_manage' => ['RECEIVING', 'INVENTORY', 'CHAPTER_HEAD'],
        'allocation_queue.read' => ['INVENTORY', 'DISPATCH', 'RF_APPROVER', 'CHAPTER_HEAD'],
        'alerts.read' => ['INVENTORY', 'DISPATCH', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING', 'RF_APPROVER', 'FINANCE', 'CHAPTER_HEAD', 'INDEPENDENT_REVIEWER'],
        'reports.inventory.read' => ['INVENTORY', 'DISPATCH', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING', 'FINANCE', 'CHAPTER_HEAD', 'INDEPENDENT_REVIEWER'],
        'reports.procurement.read' => ['INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING', 'FINANCE', 'CHAPTER_HEAD', 'INDEPENDENT_REVIEWER'],
        'reports.control.read' => ['INVENTORY', 'RECEIVING', 'BUDGET_APPROVER', 'FINANCE', 'CHAPTER_HEAD', 'INDEPENDENT_REVIEWER'],
    ];

    private const QUOTATION_POLICY = ['purchasing_quotation_policy' => ['CHAPTER_HEAD', 'PurchasingQuotationPolicyValue']];

    private const DONATION_AUTHORIZATION = ['da_authorization' => ['CHAPTER_HEAD', 'DaAuthorizationPolicyValue']];

    private const VALUATION_POLICY = ['valuation_rounding' => ['FINANCE', 'OpeningValuationPolicyValue']];

    private const RM_SERIES = ['reference_series' => ['CHAPTER_HEAD', 'OpeningReferencePolicyValue']];

    private const CHAPTER_POLICIES = [
        'rf.submit' => ['rf_approval_route' => ['CHAPTER_HEAD', 'RfApprovalRoutePolicyValue']],
        'rf.approve' => ['rf_approval_route' => ['CHAPTER_HEAD', 'RfApprovalRoutePolicyValue']],
        'opening_rm.post' => self::RM_SERIES + self::VALUATION_POLICY,
        'repf.submit' => ['reference_series' => ['CHAPTER_HEAD', 'RepfReferenceSeriesPolicyValue']],
        'quotation.select' => self::QUOTATION_POLICY,
        'po.draft' => self::QUOTATION_POLICY,
        'po.submit' => self::QUOTATION_POLICY,
        'po.amend_approve' => self::QUOTATION_POLICY,
        'da.draft' => self::VALUATION_POLICY,
        'da.submit' => self::VALUATION_POLICY,
        'da.acknowledge' => self::DONATION_AUTHORIZATION,
        'da.restriction_resolve' => self::DONATION_AUTHORIZATION,
        'receiving.inspect' => self::VALUATION_POLICY,
        'receiving.post' => self::RM_SERIES + self::VALUATION_POLICY,
        'allocation_queue.read' => ['allocation_priority' => ['CHAPTER_HEAD', 'AllocationPriorityPolicyValue']],
    ];

    public const DUTIES = [
        'COMMITTEE_REQUESTER', 'RF_APPROVER', 'SALES_OFFICER', 'SALES_REVIEWER',
        'FINANCE', 'INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING',
        'DISPATCH', 'BOOTH_CUSTODIAN', 'BOOTH_CASHIER', 'INDEPENDENT_REVIEWER', 'CHAPTER_HEAD',
    ];

    public const AVAILABLE_CHAPTERS = ['setup', 'live', 'active'];

    /** @param Collection<int, DutyGrant> $grants */
    private function __construct(
        public readonly ChapterMembership $membership,
        public readonly Chapter $chapter,
        public readonly Collection $grants,
        public readonly int $version,
        private readonly array $alternateScopes,
    ) {}

    public static function setupEntitlements(string $userId): Builder
    {
        $now = now()->format('Y-m-d H:i:s.u');

        return DB::table('chapter_setup_entitlements')->where('user_id', $userId)
            ->where('starts_at', '<=', $now)->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', $now));
    }

    public static function forChapter(User $user, string $chapterId): self
    {
        $membership = $user->memberships()->where('chapter_id', $chapterId)
            ->current()->sharedLock()->first();
        $chapter = Chapter::whereKey($chapterId)->whereIn('status', self::AVAILABLE_CHAPTERS)->sharedLock()->first();
        if (! $membership || ! $chapter) {
            throw new ContractException(404, 'chapter_not_found', 'Chapter not found.');
        }

        return self::fromMembership($membership, $chapter);
    }

    public static function fromMembership(ChapterMembership $membership, Chapter $chapter): self
    {
        $allGrants = $chapter->dutyGrants()->where('user_id', $membership->user_id)->orderBy('id')->sharedLock()->get();
        $now = now();
        $version = (int) $membership->version + (int) $allGrants->sum('version');
        $alternateScopes = [];
        $grants = $allGrants->filter(function (DutyGrant $grant) use ($now, $chapter, &$version, &$alternateScopes) {
            if (! $grant->is_alternate) {
                return self::current($grant, $now);
            }
            if (! $grant->replaces_user_id || $grant->replaces_user_id === $grant->user_id) {
                return false;
            }

            $primary = User::whereKey($grant->replaces_user_id)->sharedLock()->first();
            $membership = $primary?->memberships()->where('chapter_id', $chapter->id)->sharedLock()->first();
            $sources = $chapter->dutyGrants()->where('user_id', $grant->replaces_user_id)->where('duty_code', $grant->duty_code)
                ->where('is_alternate', false)->orderBy('id')->sharedLock()->get();
            $version += (int) $primary?->version + (int) $membership?->version + (int) $sources->sum('version');

            if (! self::current($grant, $now) || ! $grant->valid_from || ! $grant->valid_until || ! $grant->scope
                || ! $primary || ! in_array($primary->status, ['active', 'enabled'], true)
                || ! $membership?->isCurrent()
                || ! $sources->contains(fn (DutyGrant $source) => self::current($source, $now)
                    && self::covers($source, $grant->scope['unit_id'] ?? null, $grant->scope['limit_php'] ?? null))) {
                return false;
            }

            $scope = $grant->alternateDecisionScope();
            if ($scope === null) {
                return false;
            }

            $alternateScopes[$grant->id] = $scope;

            return true;
        });

        return new self($membership, $chapter, $grants->values(), $version, $alternateScopes);
    }

    private static function current(DutyGrant $grant, $now): bool
    {
        return $grant->status === 'active' && in_array($grant->duty_code, self::DUTIES, true)
            && ($grant->valid_from === null || $grant->valid_from <= $now)
            && ($grant->valid_until === null || $grant->valid_until > $now);
    }

    public function duties(): array
    {
        return array_values(array_intersect(self::DUTIES, $this->grants->pluck('duty_code')->all()));
    }

    public function lockPoliciesFor(array $actions): void
    {
        $keys = collect($actions)->flatMap(fn ($action) => [
            ...array_keys(self::CHAPTER_POLICIES[$action] ?? []),
            ...match ($action) {
                'rf.submit', 'rf.approve' => ['quantity_scale', 'reference_series'],
                'ipc.authorize' => ['ipc_authorization'],
                'opening_rm.post' => ['ipc_authorization', 'quantity_scale'],
                'issue.prepare', 'issue.post', 'rf.reserve', 'rf.reallocate' => ['quantity_scale', 'reference_series', 'allocation_priority'],
                'repf.draft', 'repf.submit', 'repf.budget_review', 'replenishment.read' => ['quantity_scale', 'rop', 'target_level'],
                'po.approve' => ['purchasing_quotation_policy', 'reference_series'],
                'da.acknowledge' => ['quantity_scale', 'reference_series', 'valuation_rounding'],
                'po.draft', 'po.amend_propose', 'da.draft', 'da.submit', 'receiving.draft', 'receiving.inspect', 'receiving.post', 'allocation_queue.read' => ['quantity_scale'],
                default => [],
            },
        ])->unique()->sort()->values();
        if ($keys->isNotEmpty()) {
            $this->chapter->policyRecords()->whereIn('policy_code', $keys)->orderBy('policy_code')->orderBy('id')->sharedLock()->get();
        }
    }

    public function chapterPolicyBlockers(Collection $policies): array
    {
        $byAction = [];
        $evidence = [];
        $resolved = [];
        $at = now();
        $duties = $this->duties();

        foreach (self::CHAPTER_POLICIES as $action => $settings) {
            if (! array_intersect($duties, self::ACTION_DUTIES[$action])) {
                continue;
            }

            foreach ($settings as $key => [$owner, $schema]) {
                if (! array_key_exists($schema, $resolved[$key] ?? [])) {
                    $states = $policies->where('policy_code', $key)->map(function (PolicyRecord $policy) use ($owner, $schema, $at, &$evidence) {
                        $approval = $evidence[$policy->id] ??= $policy->setupEvidence();

                        return self::policyState($policy, $owner, $schema, at: $at, evidence: $approval);
                    });
                    $resolved[$key][$schema] = self::blockerForStates($key, $owner, $states);
                }
                if ($blocker = $resolved[$key][$schema]) {
                    $byAction[$action][] = $blocker;
                }
            }
        }

        return $byAction;
    }

    public function routedRfApprover(InternalRf $rf): ?DutyGrant
    {
        if ($rf->requesting_unit_id === null || $rf->requester_user_id === $this->membership->user_id) {
            return null;
        }

        $policy = $this->chapter->policyRecords()->where('policy_code', 'rf_approval_route')
            ->orderByDesc('policy_version')->sharedLock()->get()
            ->first(fn (PolicyRecord $record) => self::policyState($record, 'CHAPTER_HEAD', 'RfApprovalRoutePolicyValue') === 'effective');
        $route = collect($policy?->rules_json['routes'] ?? [])->firstWhere('requesting_unit_id', $rf->requesting_unit_id);
        if (! $route) {
            return null;
        }

        $primaryId = $route['primary_approver_grant_id'] ?? null;
        $primary = $this->chapter->dutyGrants()->whereKey($primaryId)->where('is_alternate', false)
            ->where('duty_code', 'RF_APPROVER')->sharedLock()->first();
        if (! $primary || ! self::current($primary, now()) || ! self::covers($primary, $rf->requesting_unit_id)) {
            return null;
        }

        $decision = 'rf_approval_route:'.($policy->aggregate_id ?? $policy->id).':'.$rf->requesting_unit_id;

        return $this->grants->first(fn (DutyGrant $grant) => $grant->duty_code === 'RF_APPROVER'
            && self::covers($grant, $rf->requesting_unit_id)
            && ($grant->id === $primary->id || ($grant->is_alternate && $grant->replaces_user_id === $primary->user_id
                && in_array($grant->id, $route['alternate_authorization_ids'] ?? [], true)
                && ($this->alternateScopes[$grant->id] ?? null) === $decision)));
    }

    public function rfDecisionScope(InternalRf $rf): ?string
    {
        $grant = $this->routedRfApprover($rf);

        return $grant ? ($this->alternateScopes[$grant->id] ?? null) : null;
    }

    public static function policyState(PolicyRecord $policy, string $owner, string $schema, ?string $allowedSubjectId = null, ?CarbonInterface $at = null, ?array $evidence = null): ?string
    {
        $evidence ??= $policy->setupEvidence();
        $subject = $evidence['subject_id'] ?? null;
        $schemaReference = $evidence['value_schema_reference'] ?? null;
        if ($schemaReference === null && $policy->policy_code === 'reference_series') {
            $value = $policy->rules_json;
            $kind = $value['document_kind'] ?? null;
            $family = is_string($kind) ? (ReferenceSequenceService::NUMBERED_SERIES_SCHEMAS[$kind] ?? null) : null;
            if (isset($value['ipc_prefix'], $value['rm_prefix'])) {
                $family = 'OpeningReferencePolicyValue';
            }
            $schemaReference = $family === null ? null : '#/components/schemas/'.$family;
        }

        if (($subject !== null && ($allowedSubjectId === null || $subject !== $allowedSubjectId))
            || ($schemaReference !== null && $schemaReference !== '#/components/schemas/'.$schema)) {
            return null;
        }
        if (! isset($evidence['value_schema_reference'])
            || ! collect($evidence['approvals'] ?? [])->contains('authority', $owner)) {
            return 'unapproved';
        }
        $at ??= now();
        if (! $policy->effective_from || $policy->effective_from > $at) {
            return 'not_effective';
        }

        return $policy->effective_until && $policy->effective_until <= $at ? 'expired' : 'effective';
    }

    public static function setupBlocker(string $setting, string $owner, string $state): array
    {
        return [
            'setting_key' => $setting, 'subject_id' => null, 'state' => $state, 'approval_owner' => $owner,
            'message' => 'Current approved setup is required for this action.',
        ];
    }

    public function rfRouteBlocker(): ?array
    {
        $policies = $this->chapter->policyRecords()->where('policy_code', 'rf_approval_route')->sharedLock()->get();

        return self::policyBlocker($policies, 'rf_approval_route', 'CHAPTER_HEAD', 'RfApprovalRoutePolicyValue');
    }

    public static function policyBlocker(Collection $policies, string $key, string $owner, string $schema, ?CarbonInterface $at = null): ?array
    {
        $at ??= now();
        $states = $policies->where('policy_code', $key)->map(fn (PolicyRecord $policy) => self::policyState($policy, $owner, $schema, at: $at));

        return self::blockerForStates($key, $owner, $states);
    }

    private static function blockerForStates(string $key, string $owner, Collection $states): ?array
    {
        foreach (['effective', 'not_effective', 'expired', 'unapproved'] as $state) {
            if ($states->containsStrict($state)) {
                return $state === 'effective' ? null : self::setupBlocker($key, $owner, $state);
            }
        }

        return self::setupBlocker($key, $owner, 'missing');
    }

    public function allowsDuty(string $duty, ?string $unitId = null, ?string $decisionScope = null, ?string $amount = null): bool
    {
        return $this->grants->contains(function (DutyGrant $grant) use ($duty, $unitId, $decisionScope, $amount): bool {
            if ($grant->duty_code !== $duty || ! self::covers($grant, $unitId)) {
                return false;
            }
            if ($grant->is_alternate && ($this->alternateScopes[$grant->id] ?? null) !== $decisionScope) {
                return false;
            }
            $limit = $grant->scope['limit_php'] ?? null;

            return $amount === null || $limit === null || BigDecimal::of($amount)->compareTo($limit) <= 0;
        });
    }

    public function canReadRf(InternalRf $rf): bool
    {
        return $this->grants->contains(function (DutyGrant $grant) use ($rf) {
            if (! self::covers($grant, $rf->requesting_unit_id)) {
                return false;
            }

            return match ($grant->duty_code) {
                'COMMITTEE_REQUESTER' => $rf->requester_user_id === $this->membership->user_id,
                'RF_APPROVER' => $rf->status !== 'draft' && $rf->submitted_at !== null && $this->routedRfApprover($rf) !== null,
                'INVENTORY', 'DISPATCH' => $rf->approved_at !== null || $rf->status === 'approved',
                default => false,
            };
        });
    }

    public function requireAction(string $action, ?string $unitId = null, ?string $decisionScope = null): void
    {
        if (! $this->allows($action, $unitId, $decisionScope)) {
            throw new ContractException(403, 'duty_denied', 'Current duty does not permit this action.');
        }
    }

    public function allows(string $action, ?string $unitId = null, ?string $decisionScope = null): bool
    {
        return collect(self::ACTION_DUTIES[$action])->contains(fn ($duty) => $this->allowsDuty($duty, $unitId, $decisionScope));
    }

    public static function covers(DutyGrant $grant, ?string $unitId, ?string $amount = null): bool
    {
        $scopeUnit = $grant->scope['unit_id'] ?? null;
        $limit = $grant->scope['limit_php'] ?? null;

        return ($scopeUnit === null || $scopeUnit === $unitId)
            && ($amount === null || ($limit !== null && self::cents($amount) <= self::cents($limit)));
    }

    private static function cents(string $amount): int
    {
        [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');

        return (int) $whole * 100 + (int) str_pad($fraction, 2, '0');
    }
}
