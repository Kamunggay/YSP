<?php

namespace App\Services\Authority;

use App\Models\CatalogueItem;
use App\Models\CatalogueVariant;
use App\Models\DutyGrant;
use App\Models\InternalRfLine;
use App\Models\OpeningCount;
use App\Models\PolicyRecord;
use App\Services\Shared\CanonicalJson;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use JsonException;

final class SetupPolicy
{
    public const SCHEMAS = [
        'quantity_scale' => ['CatalogueQuantityPolicyValue'],
        'rop' => ['CatalogueThresholdPolicyValue'],
        'target_level' => ['CatalogueThresholdPolicyValue'],
        'price' => ['CataloguePricePolicyValue'],
        'ipc_authorization' => ['IpcAuthorizationPolicyValue'],
        'valuation_rounding' => ['OpeningValuationPolicyValue'],
        'rf_approval_route' => ['RfApprovalRoutePolicyValue'],
        'allocation_priority' => ['AllocationPriorityPolicyValue'],
        'reference_series' => ['OpeningReferencePolicyValue', 'RfReferenceSeriesPolicyValue', 'IssueReferenceSeriesPolicyValue'],
    ];

    public static function record(array $payload, Collection $users): array
    {
        $input = $payload['input'];
        $chapter = $payload['chapter_id'];
        $target = $payload['target_id'];
        $key = $input['setting_key'];
        $schema = $input['value_schema_reference'];
        $subject = $input['subject_id'];
        $expected = $payload['expected_version'];
        $financial = in_array($key, ['price', 'valuation_rounding'], true);

        if ($input['ownership'] !== ($financial ? 'financial' : 'operational')
            || ! in_array($schema, array_map(fn ($name) => '#/components/schemas/'.$name, self::SCHEMAS[$key]), true)) {
            throw new DomainException('invalid_input');
        }

        $value = self::value($input['value'], substr($schema, strlen('#/components/schemas/')));
        $from = CarbonImmutable::parse($input['effective_from']);
        $until = $input['effective_until'] === null ? null : CarbonImmutable::parse($input['effective_until']);
        if ($from->isPast() || ($until && $until <= $from)) {
            throw new DomainException('invalid_input');
        }

        $rows = PolicyRecord::where('chapter_id', $chapter)->where('policy_code', $key)
            ->orderBy('id')->lockForUpdate()->get();
        $prior = PolicyRecord::where(fn ($query) => $query->where('aggregate_id', $target)->orWhere('id', $target))
            ->orderByDesc('policy_version')->lockForUpdate()->first();
        if ((int) ($prior?->policy_version ?? 0) !== $expected || $expected >= 2147483647
            || ($prior && ($prior->aggregate_id ?? $prior->id) !== $target)) {
            throw new DomainException('version_conflict');
        }
        $priorEvidence = $prior?->setupEvidence() ?? [];
        if ($prior && $prior->chapter_id === $chapter && $prior->policy_code === 'reference_series'
            && $key === 'reference_series' && ($priorEvidence['value_schema_reference'] ?? null) !== $schema) {
            throw new DomainException('invalid_input');
        }
        if ($prior && ($prior->chapter_id !== $chapter || $prior->policy_code !== $key
            || ! array_key_exists('subject_id', $priorEvidence) || $priorEvidence['subject_id'] !== $subject
            || ($priorEvidence['value_schema_reference'] ?? null) !== $schema || ! $prior->effective_from
            || $from <= $prior->effective_from || ($prior->effective_until && $prior->effective_until != $from))) {
            throw new DomainException('setup_blocked');
        }

        $sameSetting = $rows->reject(fn (PolicyRecord $row) => $row->id === $prior?->id)->filter(function (PolicyRecord $row) use ($subject, $key, $schema) {
            $evidence = $row->setupEvidence();

            return array_key_exists('subject_id', $evidence) && $evidence['subject_id'] === $subject
                && ($key !== 'reference_series' || ($evidence['value_schema_reference'] ?? null) === $schema);
        });
        if ($sameSetting->contains(fn (PolicyRecord $row) => self::overlaps($row, $from, $until))) {
            throw new DomainException('version_conflict');
        }

        self::verifyScope($chapter, $target, $key, $subject, $value, $from, $until, $users);
        $prior?->update(['effective_until' => $from]);
        $row = PolicyRecord::create([
            ...($prior ? [] : ['id' => $target]),
            'aggregate_id' => $target,
            'chapter_id' => $chapter,
            'policy_code' => $key,
            'policy_version' => $expected + 1,
            'rules_json' => $value,
            'effective_from' => $from,
            'effective_until' => $until,
        ]);

        return [
            'setting_key' => $key,
            'subject_id' => $subject,
            'ownership' => $input['ownership'],
            'value_schema_reference' => $schema,
            'value_sha256' => CanonicalJson::sha256($value),
            'policy_record_id' => $row->id,
            'supersedes_policy_record_id' => $prior?->id,
            'predecessor_applicability_ended_at' => $prior ? $input['effective_from'] : null,
        ];
    }

    private static function value(string $json, string $schema): array
    {
        try {
            $value = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
            if (! is_array($value) || CanonicalJson::encode($value) !== $json) {
                throw new DomainException('invalid_input');
            }
        } catch (JsonException) {
            throw new DomainException('invalid_input');
        }

        $id = ['required', 'string', ControlledSetupInput::UUID];
        $instant = 'required|string|'.ControlledSetupInput::INSTANT;
        $text = 'required|string|min:1|max:200';
        $money = ['required', 'string', ControlledSetupInput::MONEY];
        $rules = match ($schema) {
            'CatalogueQuantityPolicyValue' => [
                'unit_id' => $id,
                'quantity_kind' => 'required|in:piece,kit,measured',
                'quantity_scale' => 'required|integer:strict|between:0,6',
            ],
            'CatalogueThresholdPolicyValue' => [
                'unit_id' => $id,
                'quantity' => ['required', 'string', 'regex:/\A(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?\z/'],
            ],
            'CataloguePricePolicyValue' => ['currency' => 'required|in:PHP', 'amount' => $money],
            'IpcAuthorizationPolicyValue' => [
                'cutoff_at' => $instant,
                'count_team_ids' => 'required|array|list|min:2',
                'count_team_ids.*' => [...$id, 'distinct:strict'],
                'suspension_record_reference' => $text,
            ],
            'OpeningValuationPolicyValue' => [
                'currency' => 'required|in:PHP',
                'unit_value_scale' => 'required|integer:strict|in:2',
                'rounding_mode' => 'required|in:half_up,half_even,down',
                'round_at' => 'required|in:accepted_line',
                'valuation_basis_reference' => $text,
            ],
            'OpeningReferencePolicyValue' => [
                'ipc_prefix' => 'required|string|max:40', 'rm_prefix' => 'required|string|max:40',
                'minimum_digits' => 'required|integer:strict|between:1,12',
            ],
            'RfReferenceSeriesPolicyValue', 'IssueReferenceSeriesPolicyValue' => [
                'document_kind' => 'required|in:'.($schema === 'RfReferenceSeriesPolicyValue' ? 'RF' : 'IS_AR'),
                'prefix' => 'required|string|regex:/\A[A-Z0-9]{1,12}\z/',
                'year_basis' => 'required|in:Asia/Manila',
                'sequence_width' => 'required|integer:strict|between:6,12',
            ],
            'RfApprovalRoutePolicyValue' => [
                'routes' => 'required|array|list|between:1,20',
                'routes.*' => 'required|array:requesting_unit_id,primary_approver_grant_id,alternate_authorization_ids',
                'routes.*.requesting_unit_id' => [...$id, 'distinct:strict'],
                'routes.*.primary_approver_grant_id' => $id,
                'routes.*.alternate_authorization_ids' => 'present|array|list',
                'routes.*.alternate_authorization_ids.*' => $id,
            ],
            'AllocationPriorityPolicyValue' => [
                'priorities' => 'required|array|list|between:1,20',
                'priorities.*' => 'required|array:requesting_unit_id,rank',
                'priorities.*.requesting_unit_id' => [...$id, 'distinct:strict'],
                'priorities.*.rank' => 'required|integer:strict|between:1,1000',
                'overrides' => 'present|array|list|max:5',
                'overrides.*' => 'required|array:rf_id,rf_line_id,selection_sha256,reason,expires_at',
                'overrides.*.rf_id' => $id,
                'overrides.*.rf_line_id' => $id,
                'overrides.*.selection_sha256' => 'required|string|regex:/\A[a-f0-9]{64}\z/',
                'overrides.*.reason' => 'required|string|max:500',
                'overrides.*.expires_at' => $instant,
            ],
        };
        $fields = array_filter(array_keys($rules), fn ($name) => ! str_contains($name, '.'));
        $validator = ['value' => 'required|array:'.implode(',', $fields)];
        foreach ($rules as $field => $rule) {
            $validator['value.'.$field] = $rule;
        }

        if (Validator::make(['value' => $value], $validator)->fails()
            || ($schema === 'CatalogueQuantityPolicyValue' && $value['quantity_kind'] !== 'measured' && $value['quantity_scale'] !== 0)) {
            throw new DomainException('invalid_input');
        }

        return $value;
    }

    private static function verifyScope(string $chapter, string $target, string $key, ?string $subject, array $value, CarbonImmutable $from, ?CarbonImmutable $until, Collection $users): void
    {
        if (in_array($key, ['quantity_scale', 'price', 'rop', 'target_level'], true)) {
            $model = in_array($key, ['quantity_scale', 'price'], true) ? CatalogueVariant::class : CatalogueItem::class;
            $item = $model::whereKey($subject)->where('chapter_id', $chapter)->sharedLock()->first();
            $unit = $item && isset($value['unit_id']) ? $item->unit()->where('chapter_id', $chapter)->sharedLock()->first() : null;
            if (! $item || (isset($value['unit_id']) && ($unit?->id !== $value['unit_id'] || $unit->state !== 'active'))
                || ($key === 'quantity_scale' && ($value['quantity_kind'] !== $unit->quantity_kind
                    || $value['quantity_scale'] !== (int) $unit->quantity_scale || $value['quantity_scale'] !== (int) $item->quantity_scale))
                || (isset($value['quantity']) && strlen(explode('.', $value['quantity'], 2)[1] ?? '') > (int) $unit->quantity_scale)) {
                throw new DomainException('setup_blocked');
            }

            if (isset($value['quantity'])) {
                $peerKey = $key === 'rop' ? 'target_level' : 'rop';
                $peers = PolicyRecord::where('chapter_id', $chapter)->where('policy_code', $peerKey)->orderBy('id')->sharedLock()->get();
                foreach ($peers as $peer) {
                    if (($peer->setupEvidence()['subject_id'] ?? null) === $subject && self::overlaps($peer, $from, $until)) {
                        $comparison = BigDecimal::of($value['quantity'])->compareTo($peer->rules_json['quantity']);
                        if ($peer->rules_json['unit_id'] !== $value['unit_id'] || ($key === 'rop' ? $comparison > 0 : $comparison < 0)) {
                            throw new DomainException('setup_blocked');
                        }
                    }
                }
            }

            return;
        }
        if ($key === 'ipc_authorization') {
            if ($subject !== null && ! OpeningCount::whereKey($subject)->where('chapter_id', $chapter)->sharedLock()->first()) {
                throw new DomainException('setup_blocked');
            }
            foreach ($value['count_team_ids'] as $id) {
                $counter = $users->get($id);
                if (! ControlledSetup::enabled($counter)
                    || ! $counter->memberships()->current()->where('chapter_id', $chapter)->sharedLock()->first()
                    || ! $counter->dutyGrants()->where('chapter_id', $chapter)->whereIn('duty_code', ['INVENTORY', 'INDEPENDENT_REVIEWER'])
                        ->where('status', 'active')->where('is_alternate', false)
                        ->where(fn ($query) => $query->whereNull('valid_from')->orWhere('valid_from', '<=', $from->format('Y-m-d H:i:s.u')))
                        ->where(fn ($query) => $query->whereNull('valid_until')->orWhere('valid_until', '>', $from->format('Y-m-d H:i:s.u')))
                        ->sharedLock()->first()) {
                    throw new DomainException('setup_blocked');
                }
            }
        } elseif ($subject !== null) {
            throw new DomainException('invalid_input');
        }

        foreach ($value['routes'] ?? $value['priorities'] ?? [] as $assignment) {
            $unit = $assignment['requesting_unit_id'];
            if (! self::unitExists($chapter, $unit)) {
                throw new DomainException('setup_blocked');
            }
            if ($key === 'rf_approval_route') {
                self::verifyRoute($chapter, $target, $unit, $assignment, $users);
            }
        }
        foreach ($value['overrides'] ?? [] as $override) {
            $expires = CarbonImmutable::parse($override['expires_at']);
            if ($expires <= $from || ($until && $expires > $until)
                || ! InternalRfLine::whereKey($override['rf_line_id'])->where('rf_id', $override['rf_id'])
                    ->whereHas('rf', fn ($query) => $query->where('chapter_id', $chapter))->sharedLock()->first()) {
                throw new DomainException('setup_blocked');
            }
        }
    }

    private static function verifyRoute(string $chapter, string $target, string $unit, array $route, Collection $users): void
    {
        $ids = $route['alternate_authorization_ids'];
        $primary = self::currentRfGrant($chapter, $route['primary_approver_grant_id'], $unit, $users);
        if (! $primary || $primary->is_alternate || count(array_unique($ids)) !== count($ids)) {
            throw new DomainException('setup_blocked');
        }

        foreach ($ids as $id) {
            $alternate = self::currentRfGrant($chapter, $id, $unit, $users);
            if (! $alternate || $alternate->user_id === $primary->user_id || $alternate->replaces_user_id !== $primary->user_id
                || $alternate->alternateDecisionScope() !== "rf_approval_route:{$target}:{$unit}") {
                throw new DomainException('setup_blocked');
            }
        }
    }

    private static function currentRfGrant(string $chapter, string $id, string $unit, Collection $users): ?DutyGrant
    {
        $grant = DutyGrant::whereKey($id)->where('chapter_id', $chapter)->where('duty_code', 'RF_APPROVER')
            ->where('status', 'active')->sharedLock()->first();
        if (! $grant || $grant->valid_from?->isFuture() || ($grant->valid_until && ! $grant->valid_until->isFuture())
            || ! ChapterAuthority::covers($grant, $unit)) {
            return null;
        }
        $user = $users->get($grant->user_id);

        return ControlledSetup::enabled($user) && $user->memberships()->current()->where('chapter_id', $chapter)->sharedLock()->first()
            ? $grant : null;
    }

    private static function overlaps(PolicyRecord $row, CarbonImmutable $from, ?CarbonImmutable $until): bool
    {
        return (! $row->effective_until || $row->effective_until > $from)
            && (! $until || ! $row->effective_from || $row->effective_from < $until);
    }

    public static function unitExists(string $chapter, string $unit): bool
    {
        return DB::table('chapter_organizational_units')->where('id', $unit)->where('chapter_id', $chapter)
            ->where(fn ($query) => $query->whereNull('ended_at')->orWhere('ended_at', '>', now()->format('Y-m-d H:i:s.u')))
            ->sharedLock()->first() !== null;
    }
}
