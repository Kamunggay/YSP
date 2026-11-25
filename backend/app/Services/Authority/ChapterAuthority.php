<?php

namespace App\Services\Authority;

use App\Exceptions\ContractException;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InternalRf;
use App\Models\PolicyRecord;
use App\Models\User;
use Illuminate\Support\Collection;

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
    ) {}

    public static function forChapter(User $user, string $chapterId): self
    {
        $membership = $user->memberships()->where('chapter_id', $chapterId)
            ->where('membership_status', 'active')->sharedLock()->first();
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
        $current = fn (DutyGrant $grant) => $grant->status === 'active'
            && in_array($grant->duty_code, self::DUTIES, true)
            && ($grant->valid_from === null || $grant->valid_from <= $now)
            && ($grant->valid_until === null || $grant->valid_until > $now)
            && ($grant->valid_from === null || $grant->valid_until === null || $grant->valid_from < $grant->valid_until);
        $grants = $allGrants->filter(function (DutyGrant $grant) use ($current, $chapter) {
            if (! $current($grant)) {
                return false;
            }
            if (! $grant->is_alternate) {
                return true;
            }
            if ($grant->valid_from === null || $grant->valid_until === null || ! $grant->replaces_user_id
                || $grant->replaces_user_id === $grant->user_id) {
                return false;
            }

            $primary = User::whereKey($grant->replaces_user_id)->whereIn('status', ['active', 'enabled'])->sharedLock()->first();
            if (! $primary || ! $primary->memberships()->where('chapter_id', $chapter->id)
                ->where('membership_status', 'active')->sharedLock()->first()) {
                return false;
            }

            return $chapter->dutyGrants()->where('user_id', $primary->id)->where('duty_code', $grant->duty_code)
                ->where('is_alternate', false)->orderBy('id')->sharedLock()->get()
                ->contains(fn (DutyGrant $source) => $current($source)
                    && self::covers($source, $grant->scope['unit_id'] ?? null, $grant->scope['limit_php'] ?? null));
        });

        return new self($membership, $chapter, $grants->values(),
            (int) $membership->version + (int) $allGrants->sum('version'));
    }

    public function duties(): array
    {
        return array_values(array_intersect(self::DUTIES, $this->grants->pluck('duty_code')->all()));
    }

    public function lockPoliciesFor(array $actions): void
    {
        $keys = collect($actions)->flatMap(fn ($action) => match ($action) {
            'rf.submit', 'rf.approve' => ['rf_approval_route', 'quantity_scale', 'reference_series'],
            'ipc.authorize' => ['ipc_authorization'],
            'opening_rm.post' => ['ipc_authorization', 'quantity_scale', 'reference_series', 'valuation_rounding'],
            'issue.prepare', 'issue.post', 'rf.reserve', 'rf.reallocate' => ['quantity_scale', 'reference_series', 'allocation_priority'],
            default => [],
        })->unique()->sort()->values();
        if ($keys->isNotEmpty()) {
            $this->chapter->policyRecords()->whereIn('policy_code', $keys)->orderBy('policy_code')->orderBy('id')->sharedLock()->get();
        }
    }

    public function routedRfApprover(InternalRf $rf): ?DutyGrant
    {
        if ($rf->requesting_unit_id === null || $rf->requester_user_id === $this->membership->user_id) {
            return null;
        }

        $now = now();
        $policies = $this->chapter->policyRecords()->where('policy_code', 'rf_approval_route')
            ->orderByDesc('policy_version')->sharedLock()->get();
        $policy = $policies->first(fn (PolicyRecord $record) => ($record->rules_json['approval_owner'] ?? null) === 'CHAPTER_HEAD'
            && ($record->rules_json['subject_id'] ?? null) === null
            && $record->effective_from && $record->effective_from <= $now
            && ($record->effective_until === null || $record->effective_until > $now));
        $route = collect($policy?->rules_json['routes'] ?? [])->firstWhere('requesting_unit_id', $rf->requesting_unit_id);
        $ids = array_merge([$route['primary_approver_grant_id'] ?? null], $route['alternate_authorization_ids'] ?? []);

        return $this->grants->first(fn (DutyGrant $grant) => $grant->duty_code === 'RF_APPROVER'
            && self::covers($grant, $rf->requesting_unit_id)
            && in_array($grant->id, $ids, true));
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

    public function requireAction(string $action, ?string $unitId = null, ?string $amount = null): void
    {
        if (! $this->allows($action, $unitId, $amount)) {
            throw new ContractException(403, 'duty_denied', 'Current duty does not permit this action.');
        }
    }

    public function allows(string $action, ?string $unitId = null, ?string $amount = null): bool
    {
        return $this->grants->contains(fn (DutyGrant $grant) => in_array($grant->duty_code, self::ACTION_DUTIES[$action], true)
            && self::covers($grant, $unitId, $amount));
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
