<?php

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\ChapterOpeningGuard;
use App\Models\DutyGrant;
use App\Models\EvidenceRecord;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Shared\BcMath;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class PrepareReceivingInventoryParticipant
{
    private const MAX_PHP_VALUE = '999999999999.99';

    private const STOCK_QUANTITY_PATTERN = '/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/';

    private const PHP_AMOUNT_PATTERN = '/^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/';

    private const REQUIRED_INPUT_KEYS = [
        'actor_id',
        'chapter_id',
        'operation_id',
        'source_kind',
        'rm_id',
        'rm_reference',
        'rm_material_version',
        'source_id',
        'source_reference',
        'source_material_version',
        'donor_id',
        'donor_name',
        'location_id',
        'current_stock_version',
        'acknowledgment',
        'lines',
    ];

    private const REQUIRED_LINE_KEYS = [
        'rm_line_id',
        'source_line_id',
        'variant_id',
        'variant_material_version',
        'item_id',
        'unit_id',
        'unit_material_version',
        'quantity_scale',
        'historical_variant_label',
        'delivered_quantity',
        'accepted_quantity',
        'damaged_quantity',
        'rejected_quantity',
        'unit_valuation_php',
        'restrictions',
        'discrepancy_notes',
        'resolves_discrepancy_id',
    ];

    public function __construct(private CheckEvidenceBindingParticipant $evidence) {}

    /**
     * Synchronous internal Stage 2 receiving-posting participant (PrepareReceivingInventoryInput -> PrepareReceivingInventoryResult).
     * Runs strictly inside Leader's single outer database transaction and exposes zero HTTP routes.
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $sourceContext  Locked source lines and canonical inspected RM snapshot from the caller.
     * @return array<string, mixed>
     */
    public function prepare(array $input, array $sourceContext, ?CarbonInterface $postedAt = null): array
    {
        if (DB::transactionLevel() === 0) {
            throw new RuntimeException('PrepareReceivingInventoryParticipant requires an active outer transaction.');
        }

        $validationError = $this->validateClosedInput($input);
        if ($validationError !== null) {
            return $this->reject($validationError);
        }

        $chapterId = $input['chapter_id'];
        $actorId = $input['actor_id'];
        $sourceKind = $input['source_kind'];
        $rmId = $input['rm_id'];
        $rmReference = $input['rm_reference'];
        $expectedStockVersion = (int) $input['current_stock_version'];

        if (! $this->verifyActorAuthority($chapterId, $actorId)) {
            return $this->reject('authority_changed');
        }

        $roundingMode = $this->resolveEffectiveRoundingMode($chapterId);
        if ($roundingMode === null) {
            return $this->reject('setup_blocked');
        }

        $guard = ChapterOpeningGuard::where('chapter_id', $chapterId)->lockForUpdate()->first();
        if (! $guard) {
            return $this->reject('setup_blocked');
        }
        if ((int) $guard->stock_version !== $expectedStockVersion) {
            return $this->reject('stale_version');
        }

        $evidenceError = $this->verifyEvidenceAcknowledgment($input, $sourceContext['snapshot'] ?? null);
        if ($evidenceError !== null) {
            return $this->reject($evidenceError);
        }

        $sourceEligibilityError = $this->verifySourceHeader($input, $sourceContext);
        if ($sourceEligibilityError !== null) {
            return $this->reject($sourceEligibilityError);
        }

        $planned = $this->planAndLockDependencies($input, $sourceContext, $roundingMode);
        if (isset($planned['rejected_reason'])) {
            return $this->reject($planned['rejected_reason']);
        }

        $commitTime = $postedAt ? CarbonImmutable::instance($postedAt)->utc() : CarbonImmutable::now('UTC');
        $commitTimeStr = $commitTime->format('Y-m-d\TH:i:s.u\Z');
        $nextStockVersion = $expectedStockVersion + 1;

        $guard->stock_version = $nextStockVersion;
        $guard->save();

        $posting = InventoryPosting::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'posting_reference' => $rmReference,
            'source_type' => strtoupper($sourceKind),
            'source_id' => $rmId,
            'actor_id' => $actorId,
            'notes' => "Stage 2 receiving report {$rmReference} ({$sourceKind})",
            'created_at' => $commitTime,
        ]);

        $usableLots = [];
        $nonUsableLots = [];
        $movements = [];
        $createdDiscrepancies = [];
        $sourceDeltas = [];

        foreach ($planned['entries'] as $entry) {
            /** @var CatalogueUnit $unit */
            $unit = $entry['unit'];
            if (! $unit->quantity_identity_locked) {
                $unit->quantity_identity_locked = true;
                $unit->save();
            }

            $ln = $entry['line'];
            $srcLineId = $ln['source_line_id'];
            if (! isset($sourceDeltas[$srcLineId])) {
                $sourceDeltas[$srcLineId] = [
                    'accepted' => BigDecimal::zero(),
                    'disputed' => BigDecimal::zero(),
                    'scale' => $entry['scale'],
                ];
            }
            $sourceDeltas[$srcLineId]['accepted'] = $sourceDeltas[$srcLineId]['accepted']->plus($entry['acc']);
            $sourceDeltas[$srcLineId]['disputed'] = $sourceDeltas[$srcLineId]['disputed']->plus($entry['dmg'])->plus($entry['rej']);

            $quarantinedLotId = null;
            $rejectedLotId = null;

            foreach ([
                ['qty' => $entry['acc'], 'raw' => $ln['accepted_quantity'], 'kind' => 'accepted_receipt', 'db_cond' => 'USABLE', 'api_cond' => 'usable', 'bucket' => 'usable'],
                ['qty' => $entry['dmg'], 'raw' => $ln['damaged_quantity'], 'kind' => 'quarantined_receipt', 'db_cond' => 'QUARANTINE', 'api_cond' => 'quarantined', 'bucket' => 'non_usable'],
                ['qty' => $entry['rej'], 'raw' => $ln['rejected_quantity'], 'kind' => 'rejected_receipt', 'db_cond' => 'REJECTED', 'api_cond' => 'rejected', 'bucket' => 'non_usable'],
            ] as $spec) {
                if (! $spec['qty']->isPositive()) {
                    continue;
                }

                $posted = $this->persistLotAndMovement(
                    $input,
                    $ln,
                    $posting->id,
                    $nextStockVersion,
                    $entry['custodian_id'],
                    $entry['scale'],
                    $spec,
                    $roundingMode,
                    $commitTime,
                    $commitTimeStr
                );

                $movements[] = $posted['movement'];
                if ($spec['bucket'] === 'usable') {
                    $usableLots[] = $posted['lot'];
                } else {
                    $nonUsableLots[] = $posted['lot'];
                    if ($spec['api_cond'] === 'quarantined') {
                        $quarantinedLotId = $posted['lot']['lot_id'];
                    } else {
                        $rejectedLotId = $posted['lot']['lot_id'];
                    }
                }
            }

            if ($entry['dmg']->isPositive() || $entry['rej']->isPositive()) {
                $totalDiscrepant = $entry['dmg']->plus($entry['rej']);
                $createdDiscrepancies[] = [
                    'discrepancy_id' => (string) Str::uuid(),
                    'rm_line_id' => $ln['rm_line_id'],
                    'source_line_id' => $srcLineId,
                    'variant_id' => $ln['variant_id'],
                    'unit_id' => $ln['unit_id'],
                    'damaged_quantity' => BcMath::format((string) $entry['dmg'], $entry['scale']),
                    'rejected_quantity' => BcMath::format((string) $entry['rej'], $entry['scale']),
                    'total_discrepant_quantity' => BcMath::format((string) $totalDiscrepant, $entry['scale']),
                    'quarantined_lot_id' => $quarantinedLotId,
                    'rejected_lot_id' => $rejectedLotId,
                ];
            }
        }

        $sourceLineUpdates = $this->buildSourceLineUpdates($sourceContext, $sourceDeltas, $sourceKind);

        $this->assertLotConservation($usableLots, $nonUsableLots, $planned['totals']);

        return [
            'outcome' => 'ready',
            'stock_version' => $nextStockVersion,
            'usable_lots' => $usableLots,
            'quarantined_or_rejected_lots' => $nonUsableLots,
            'movements' => $movements,
            'created_discrepancies' => $createdDiscrepancies,
            'source_line_updates' => $sourceLineUpdates,
            'emit_stock_lot_changed_event' => true,
        ];
    }

    /** @return array{outcome: string, reason: string} */
    private function reject(string $reason): array
    {
        return ['outcome' => 'rejected', 'reason' => $reason];
    }

    private function validateClosedInput(array $input): ?string
    {
        if (! $this->hasExactKeys($input, self::REQUIRED_INPUT_KEYS)) {
            return 'source_not_eligible';
        }

        foreach (['actor_id', 'chapter_id', 'operation_id', 'rm_id', 'source_id', 'location_id'] as $uuidField) {
            if (! $this->isUuid($input[$uuidField])) {
                return 'source_not_eligible';
            }
        }

        if (! in_array($input['source_kind'], ['po_rm', 'da_rm'], true)) {
            return 'source_not_eligible';
        }

        foreach (['rm_reference', 'source_reference'] as $refField) {
            if (! is_string($input[$refField]) || trim($input[$refField]) === '' || strlen($input[$refField]) > 80) {
                return 'source_not_eligible';
            }
        }

        foreach (['rm_material_version', 'source_material_version', 'current_stock_version'] as $verField) {
            if (! is_int($input[$verField]) || $input[$verField] < 1) {
                return 'source_not_eligible';
            }
        }

        if ($input['source_kind'] === 'po_rm') {
            if ($input['donor_id'] !== null || $input['donor_name'] !== null) {
                return 'source_not_eligible';
            }
        } else {
            if (($input['donor_id'] !== null && ! $this->isUuid($input['donor_id']))
                || ! is_string($input['donor_name'])
                || trim($input['donor_name']) === ''
                || strlen($input['donor_name']) > 200) {
                return 'source_not_eligible';
            }
        }

        if (! is_array($input['acknowledgment'])) {
            return 'evidence_missing';
        }

        $lines = $input['lines'];
        if (! is_array($lines) || count($lines) < 1 || count($lines) > 100) {
            return 'source_not_eligible';
        }

        $seenRmLineIds = [];
        foreach ($lines as $ln) {
            if (! is_array($ln) || ! $this->hasExactKeys($ln, self::REQUIRED_LINE_KEYS)) {
                return 'source_not_eligible';
            }
            foreach (['rm_line_id', 'source_line_id', 'variant_id', 'item_id', 'unit_id'] as $uuidKey) {
                if (! $this->isUuid($ln[$uuidKey])) {
                    return 'source_not_eligible';
                }
            }
            if (isset($seenRmLineIds[$ln['rm_line_id']])) {
                return 'source_not_eligible';
            }
            $seenRmLineIds[$ln['rm_line_id']] = true;

            if (! is_int($ln['variant_material_version']) || $ln['variant_material_version'] < 1
                || ! is_int($ln['unit_material_version']) || $ln['unit_material_version'] < 1
                || ! is_int($ln['quantity_scale']) || $ln['quantity_scale'] < 0 || $ln['quantity_scale'] > 6
                || ! is_string($ln['historical_variant_label']) || trim($ln['historical_variant_label']) === '' || mb_strlen($ln['historical_variant_label']) > 120) {
                return 'source_not_eligible';
            }

            if ($ln['resolves_discrepancy_id'] !== null && ! $this->isUuid($ln['resolves_discrepancy_id'])) {
                return 'source_not_eligible';
            }

            if ($input['source_kind'] === 'da_rm' && $ln['resolves_discrepancy_id'] !== null) {
                return 'source_not_eligible';
            }

            if ($input['source_kind'] === 'po_rm') {
                if (! DonationRestrictionSupport::isStrictlyUnrestricted($ln['restrictions'])) {
                    return 'source_not_eligible';
                }
            } elseif (! DonationRestrictionSupport::isValid($ln['restrictions'])) {
                return 'source_not_eligible';
            }
        }

        return null;
    }

    private function verifyActorAuthority(string $chapterId, string $actorId): bool
    {
        $chapter = Chapter::whereKey($chapterId)->whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS)->sharedLock()->first();
        $actor = User::whereKey($actorId)->whereIn('status', ['active', 'enabled'])->sharedLock()->first();
        if (! $chapter || ! $actor) {
            return false;
        }

        $membership = ChapterMembership::where('chapter_id', $chapterId)
            ->where('user_id', $actorId)
            ->current()
            ->sharedLock()
            ->first();
        if (! $membership) {
            return false;
        }

        $now = now();
        $grants = DutyGrant::where('chapter_id', $chapterId)
            ->where('user_id', $actorId)
            ->where('duty_code', 'RECEIVING')
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', $now))
            ->where(fn ($q) => $q->whereNull('valid_until')->orWhere('valid_until', '>', $now))
            ->sharedLock()
            ->get();

        return $grants->isNotEmpty();
    }

    private function resolveEffectiveRoundingMode(string $chapterId): ?RoundingMode
    {
        $now = now('UTC');
        $policies = PolicyRecord::where('chapter_id', $chapterId)
            ->where('policy_code', 'valuation_rounding')
            ->orderByDesc('policy_version')
            ->sharedLock()
            ->get();

        foreach ($policies as $policy) {
            $evidence = $policy->setupEvidence();
            $hasFinanceApproval = collect($evidence['approvals'] ?? [])->contains('authority', 'FINANCE');
            $effectiveFrom = $policy->effective_from;
            $effectiveUntil = $policy->effective_until;

            if (! $hasFinanceApproval || ! $effectiveFrom || $effectiveFrom->isFuture()
                || ($effectiveUntil && ! $effectiveUntil->isFuture())) {
                continue;
            }

            $mode = $policy->rules_json['rounding_mode'] ?? null;

            // Stage 2 requires round_half_up(..., 2) per agreement.md.
            return match ($mode) {
                'half_up' => RoundingMode::HalfUp,
                'half_even' => RoundingMode::HalfEven,
                'down' => RoundingMode::Down,
                default => null,
            };
        }

        // Guard against missing/inactive setup policy when date window shifted before transaction commit.
        unset($now);

        return null;
    }

    private function verifyEvidenceAcknowledgment(array $input, mixed $snapshot): ?string
    {
        $ack = $input['acknowledgment'];
        $purpose = $input['source_kind'] === 'po_rm' ? 'po_supplier_dr' : 'da_receipt';
        if (! $this->hasExactKeys($ack, ['acknowledgment_id', 'matched_by', 'matched_at', 'recipient_id', 'acknowledged_at', 'snapshot', 'bytes'])
            || ! is_array($snapshot)
            || ($snapshot['target']['purpose'] ?? null) !== $purpose
            || ($snapshot['target']['record_id'] ?? null) !== $input['rm_id']
            || ($snapshot['material_version'] ?? null) !== $input['rm_material_version']
            || ! is_string($snapshot['sha256'] ?? null)
            || preg_match('/^[a-f0-9]{64}$/', $snapshot['sha256']) !== 1
            || ! $this->isUuid($ack['acknowledgment_id'] ?? null)
            || ! $this->isUuid($ack['matched_by'] ?? null)
            || $ack['recipient_id'] !== null
            || ! is_array($ack['bytes'] ?? null)) {
            return 'evidence_mismatch';
        }

        $evidenceId = $ack['bytes']['evidence_id'] ?? null;
        if (! $this->isUuid($evidenceId)) {
            return 'evidence_mismatch';
        }

        $technicalState = EvidenceRecord::where('chapter_id', $input['chapter_id'])
            ->whereKey($evidenceId)->sharedLock()->value('technical_state');
        if ($technicalState === null) {
            return 'evidence_missing';
        }
        if ($technicalState !== 'ready') {
            return 'evidence_invalid';
        }

        try {
            $this->evidence->verifyMatch(
                $input['chapter_id'], $input['actor_id'], $snapshot, $ack['bytes'], $ack, null,
            );
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409) {
                throw $exception;
            }

            return $exception->errorCode;
        }

        return null;
    }

    private function verifySourceHeader(array $input, array $sourceContext): ?string
    {
        if (! isset($sourceContext['source_status'], $sourceContext['source_material_version'])
            || ! is_array($sourceContext['lines'] ?? null)) {
            return 'source_not_eligible';
        }

        if ((int) $sourceContext['source_material_version'] !== (int) $input['source_material_version']) {
            return 'stale_version';
        }

        $allowedStatuses = $input['source_kind'] === 'po_rm'
            ? ['issued', 'partially_received']
            : ['acknowledged', 'partially_received'];

        if (! in_array($sourceContext['source_status'], $allowedStatuses, true)) {
            return 'source_not_eligible';
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function planAndLockDependencies(array $input, array $sourceContext, RoundingMode $roundingMode): array
    {
        $chapterId = $input['chapter_id'];
        $locationId = $input['location_id'];
        $lines = $input['lines'];

        $itemIds = array_values(array_unique(array_column($lines, 'item_id')));
        $variantIds = array_values(array_unique(array_column($lines, 'variant_id')));
        $unitIds = array_values(array_unique(array_column($lines, 'unit_id')));
        sort($itemIds);
        sort($variantIds);
        sort($unitIds);

        $items = CatalogueItem::where('chapter_id', $chapterId)->whereIn('id', $itemIds)->orderBy('id')->sharedLock()->get()->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $chapterId)->whereIn('id', $variantIds)->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)->whereIn('id', $unitIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $location = CatalogueLocation::where('chapter_id', $chapterId)->whereKey($locationId)->sharedLock()->first();

        if (! $location || $location->state !== 'active') {
            return ['rejected_reason' => 'stale_version'];
        }

        $sourceLines = $sourceContext['lines'];
        $openDiscrepancies = array_flip((array) ($sourceContext['open_discrepancy_ids'] ?? []));
        $maxPhp = BigDecimal::of(self::MAX_PHP_VALUE);
        $cumulativeAcceptedBySourceLine = [];

        $entries = [];
        $totalAccepted = BigDecimal::zero();
        $totalDamaged = BigDecimal::zero();
        $totalRejected = BigDecimal::zero();

        foreach ($lines as $ln) {
            $sourceLineId = $ln['source_line_id'];
            if (! isset($sourceLines[$sourceLineId]) || ! is_array($sourceLines[$sourceLineId])) {
                return ['rejected_reason' => 'source_not_eligible'];
            }
            $srcLine = $sourceLines[$sourceLineId];

            if ($input['source_kind'] === 'da_rm') {
                $restrictions = $srcLine['restrictions'] ?? null;
                if (! DonationRestrictionSupport::isValid($restrictions)
                    || ! DonationRestrictionSupport::equals($restrictions, $ln['restrictions'])) {
                    return ['rejected_reason' => 'source_not_eligible'];
                }

                $ln['restrictions'] = $restrictions;
            }

            // Detect substitution against the locked PO/DA line before version checks.
            if (($srcLine['variant_id'] ?? null) !== $ln['variant_id'] || ($srcLine['unit_id'] ?? null) !== $ln['unit_id']) {
                return ['rejected_reason' => 'substitution_or_overdelivery_blocked'];
            }

            if ($ln['resolves_discrepancy_id'] !== null && ! isset($openDiscrepancies[$ln['resolves_discrepancy_id']])) {
                return ['rejected_reason' => 'source_not_eligible'];
            }

            $item = $items->get($ln['item_id']);
            $variant = $variants->get($ln['variant_id']);
            $unit = $units->get($ln['unit_id']);
            $scale = (int) $ln['quantity_scale'];

            if (! $item || ! $variant || ! $unit
                || $item->state !== 'active' || $variant->state !== 'active' || $unit->state !== 'active'
                || $variant->item_id !== $item->id
                || $variant->unit_id !== $unit->id
                || (int) $variant->material_version !== (int) $ln['variant_material_version']
                || (int) $unit->material_version !== (int) $ln['unit_material_version']
                || (int) $unit->quantity_scale !== $scale
                || ($variant->quantity_scale !== null && (int) $variant->quantity_scale !== $scale)) {
                return ['rejected_reason' => 'stale_version'];
            }

            if (! is_string($ln['unit_valuation_php']) || preg_match(self::PHP_AMOUNT_PATTERN, $ln['unit_valuation_php']) !== 1
                || (string) ($srcLine['unit_valuation_php'] ?? '') !== $ln['unit_valuation_php']) {
                return ['rejected_reason' => 'source_not_eligible'];
            }

            $quantities = [
                $ln['delivered_quantity'],
                $ln['accepted_quantity'],
                $ln['damaged_quantity'],
                $ln['rejected_quantity'],
            ];
            foreach ($quantities as $qtyRaw) {
                if (! $this->isExactQuantityAtScale($qtyRaw, $scale)) {
                    return ['rejected_reason' => 'source_not_eligible'];
                }
            }

            $del = BigDecimal::of($ln['delivered_quantity']);
            $acc = BigDecimal::of($ln['accepted_quantity']);
            $dmg = BigDecimal::of($ln['damaged_quantity']);
            $rej = BigDecimal::of($ln['rejected_quantity']);

            if (! $del->isPositive() || ! $acc->plus($dmg)->plus($rej)->isEqualTo($del)) {
                return ['rejected_reason' => 'source_not_eligible'];
            }

            if (($dmg->isPositive() || $rej->isPositive())
                && (! is_string($ln['discrepancy_notes']) || trim($ln['discrepancy_notes']) === '' || strlen($ln['discrepancy_notes']) > 500)) {
                return ['rejected_reason' => 'source_not_eligible'];
            }

            $cumulativeAccepted = ($cumulativeAcceptedBySourceLine[$sourceLineId] ?? BigDecimal::zero())->plus($acc);
            $cumulativeAcceptedBySourceLine[$sourceLineId] = $cumulativeAccepted;

            $outstanding = BigDecimal::of((string) ($srcLine['outstanding_quantity'] ?? '0'));
            if ($cumulativeAccepted->isGreaterThan($outstanding)) {
                return ['rejected_reason' => 'substitution_or_overdelivery_blocked'];
            }

            $unitValuation = BigDecimal::of($ln['unit_valuation_php']);
            foreach ([$acc, $dmg, $rej] as $partQty) {
                if ($partQty->isPositive() && $partQty->multipliedBy($unitValuation)->toScale(2, $roundingMode)->isGreaterThan($maxPhp)) {
                    return ['rejected_reason' => 'source_not_eligible'];
                }
            }

            $totalAccepted = $totalAccepted->plus($acc);
            $totalDamaged = $totalDamaged->plus($dmg);
            $totalRejected = $totalRejected->plus($rej);

            $entries[] = [
                'line' => $ln,
                'unit' => $unit,
                'scale' => $scale,
                'custodian_id' => $location->custodian_id ?? null,
                'acc' => $acc,
                'dmg' => $dmg,
                'rej' => $rej,
            ];
        }

        return [
            'entries' => $entries,
            'totals' => [
                'accepted' => $totalAccepted,
                'damaged' => $totalDamaged,
                'rejected' => $totalRejected,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $spec
     * @return array{lot: array<string, mixed>, movement: array<string, mixed>}
     */
    private function persistLotAndMovement(
        array $input,
        array $ln,
        string $postingId,
        int $stockVersion,
        ?string $custodianId,
        int $scale,
        array $spec,
        RoundingMode $roundingMode,
        CarbonImmutable $commitTime,
        string $commitTimeStr
    ): array {
        $lotId = (string) Str::uuid();
        $segmentId = (string) Str::uuid();
        $movementId = (string) Str::uuid();
        $qtyFormatted = BcMath::format($spec['raw'], $scale);
        $qtyStored = BcMath::str($qtyFormatted);
        $immediatelyAllocatable = $spec['api_cond'] === 'usable' && ($ln['restrictions']['state'] ?? null) !== 'uninterpreted';

        $unitValuation = BigDecimal::of($ln['unit_valuation_php']);
        $totalValuePhp = (string) $spec['qty']->multipliedBy($unitValuation)->toScale(2, $roundingMode);

        $segment = [
            'id' => $segmentId,
            'quantity' => $qtyFormatted,
            'reservation' => null,
            'hold_ids' => [],
            'restrictions' => $ln['restrictions'],
            'basis_segment_id' => $segmentId,
            'offset_quantity' => '0',
        ];

        // Lot code isolates each RM line and condition so mixed restrictions and partial deliveries share a SKU cleanly.
        $lotCode = sprintf('RCV-%s-%s-%s', strtoupper($input['source_kind']), $ln['rm_line_id'], $spec['api_cond']);

        InventoryLot::create([
            'id' => $lotId,
            'chapter_id' => $input['chapter_id'],
            'variant_id' => $ln['variant_id'],
            'unit_id' => $ln['unit_id'],
            'location_id' => $input['location_id'],
            'lot_code' => $lotCode,
            'basis_segment_id' => $segmentId,
            'condition' => $spec['db_cond'],
            'custody' => 'STOCKROOM',
            'custodian_user_id' => $custodianId,
            'immediately_allocatable' => $immediatelyAllocatable,
            'quantity_on_hand' => $qtyStored,
            'original_quantity' => $qtyStored,
            'quantity_scale' => $scale,
            'segments' => [$segment],
            'stock_version' => $stockVersion,
            'historical_variant_label' => $ln['historical_variant_label'],
            'material_version' => (int) $input['rm_material_version'],
            'source_type' => $input['source_kind'],
            'source_id' => $input['rm_id'],
            'source_reference' => $input['rm_reference'],
            'source_kind' => $input['source_kind'],
            'origin_source_id' => $input['source_id'],
            'origin_source_line_id' => $ln['source_line_id'],
            'origin_source_reference' => $input['source_reference'],
            'donor_name' => $input['donor_name'],
            'restriction_state' => $ln['restrictions']['state'],
            'restrictions_json' => $ln['restrictions'],
            'rm_line_id' => $ln['rm_line_id'],
            'created_at' => $commitTime,
            'updated_at' => $commitTime,
        ]);

        InventoryMovement::create([
            'id' => $movementId,
            'posting_id' => $postingId,
            'chapter_id' => $input['chapter_id'],
            'variant_id' => $ln['variant_id'],
            'unit_id' => $ln['unit_id'],
            'location_id' => $input['location_id'],
            'condition' => $spec['db_cond'],
            'quantity' => $qtyStored,
            'balance_after' => $qtyStored,
            'created_at' => $commitTime,
            'movement_kind' => $spec['kind'],
            'source_rm_id' => $input['rm_id'],
            'source_ipc_id' => null,
            'source_ipc_line_id' => null,
            'rm_line_id' => $ln['rm_line_id'],
            'source_kind' => $input['source_kind'],
            'origin_source_id' => $input['source_id'],
            'origin_source_line_id' => $ln['source_line_id'],
            'origin_source_reference' => $input['source_reference'],
            'origin_source_material_version' => $input['source_material_version'],
            'restrictions_json' => $ln['restrictions'],
            'immediately_allocatable' => $immediatelyAllocatable,
            'lot_id' => $lotId,
            'rm_reference' => $input['rm_reference'],
            'rm_material_version' => (int) $input['rm_material_version'],
            'ipc_reference' => null,
            'ipc_material_version' => null,
            'quantity_scale' => $scale,
            'accepted_value' => $spec['api_cond'] === 'usable' ? $totalValuePhp : '0.00',
            'unit_valuation_php' => $ln['unit_valuation_php'],
            'total_value_php' => $totalValuePhp,
            'currency' => 'PHP',
            'posted_by' => $input['actor_id'],
        ]);

        return [
            'lot' => [
                'lot_id' => $lotId,
                'basis_segment_id' => $segmentId,
                'rm_line_id' => $ln['rm_line_id'],
                'source_line_id' => $ln['source_line_id'],
                'variant_id' => $ln['variant_id'],
                'unit_id' => $ln['unit_id'],
                'location_id' => $input['location_id'],
                'condition' => $spec['api_cond'],
                'custody' => 'stockroom',
                'source_kind' => $input['source_kind'],
                'quantity' => $qtyFormatted,
                'restrictions' => $ln['restrictions'],
                'immediately_allocatable' => $immediatelyAllocatable,
            ],
            'movement' => [
                'id' => $movementId,
                'chapter_id' => $input['chapter_id'],
                'kind' => $spec['kind'],
                'source_kind' => $input['source_kind'],
                'rm_id' => $input['rm_id'],
                'rm_reference' => $input['rm_reference'],
                'rm_material_version' => (int) $input['rm_material_version'],
                'rm_line_id' => $ln['rm_line_id'],
                'source_id' => $input['source_id'],
                'source_reference' => $input['source_reference'],
                'source_material_version' => (int) $input['source_material_version'],
                'source_line_id' => $ln['source_line_id'],
                'lot_id' => $lotId,
                'variant_id' => $ln['variant_id'],
                'unit_id' => $ln['unit_id'],
                'location_id' => $input['location_id'],
                'quantity' => $qtyFormatted,
                'unit_valuation_php' => $ln['unit_valuation_php'],
                'total_value_php' => $totalValuePhp,
                'currency' => 'PHP',
                'condition' => $spec['api_cond'],
                'restrictions' => $ln['restrictions'],
                'immediately_allocatable' => $immediatelyAllocatable,
                'posted_by' => $input['actor_id'],
                'posted_at' => $commitTimeStr,
            ],
        ];
    }

    /**
     * @param  array<string, array{accepted: BigDecimal, disputed: BigDecimal, scale: int}>  $sourceDeltas
     * @return list<array<string, mixed>>
     */
    private function buildSourceLineUpdates(array $sourceContext, array $sourceDeltas, string $sourceKind): array
    {
        $allLinesComplete = true;
        $anyAcceptedOnSource = false;

        foreach ($sourceContext['lines'] as $srcLineId => $srcLine) {
            $outstandingBefore = BigDecimal::of((string) ($srcLine['outstanding_quantity'] ?? '0'));
            $acceptedBefore = BigDecimal::of((string) ($srcLine['accepted_quantity'] ?? '0'));
            $deltaAccepted = $sourceDeltas[$srcLineId]['accepted'] ?? BigDecimal::zero();
            $outstandingAfter = $outstandingBefore->minus($deltaAccepted);
            $acceptedAfter = $acceptedBefore->plus($deltaAccepted);

            if ($outstandingAfter->isPositive()) {
                $allLinesComplete = false;
            }
            if ($acceptedAfter->isPositive()) {
                $anyAcceptedOnSource = true;
            }
        }

        if ($allLinesComplete) {
            $newStatus = $sourceKind === 'po_rm' ? 'receiving_complete' : 'received';
        } elseif ($anyAcceptedOnSource) {
            $newStatus = 'partially_received';
        } else {
            $newStatus = $sourceContext['source_status'];
        }

        $updates = [];
        ksort($sourceDeltas);
        foreach ($sourceDeltas as $srcLineId => $delta) {
            $srcLine = $sourceContext['lines'][$srcLineId];
            $scale = $delta['scale'];
            $acceptedBefore = BigDecimal::of((string) ($srcLine['accepted_quantity'] ?? '0'));
            $outstandingBefore = BigDecimal::of((string) ($srcLine['outstanding_quantity'] ?? '0'));
            $newAccepted = $acceptedBefore->plus($delta['accepted']);
            $newOutstanding = $outstandingBefore->minus($delta['accepted']);

            $updates[] = [
                'source_line_id' => $srcLineId,
                'accepted_delta' => BcMath::format((string) $delta['accepted'], $scale),
                'rejected_or_disputed_delta' => BcMath::format((string) $delta['disputed'], $scale),
                'new_accepted_quantity' => BcMath::format((string) $newAccepted, $scale),
                'new_outstanding_quantity' => BcMath::format((string) $newOutstanding, $scale),
                'new_source_status' => $newStatus,
            ];
        }

        return $updates;
    }

    /** @param array{accepted: BigDecimal, damaged: BigDecimal, rejected: BigDecimal} $totals */
    private function assertLotConservation(array $usableLots, array $nonUsableLots, array $totals): void
    {
        $usableSum = BigDecimal::zero();
        foreach ($usableLots as $lot) {
            $usableSum = $usableSum->plus($lot['quantity']);
        }

        $quarSum = BigDecimal::zero();
        $rejSum = BigDecimal::zero();
        foreach ($nonUsableLots as $lot) {
            if ($lot['condition'] === 'quarantined') {
                $quarSum = $quarSum->plus($lot['quantity']);
            } else {
                $rejSum = $rejSum->plus($lot['quantity']);
            }
        }

        if (! $usableSum->isEqualTo($totals['accepted'])
            || ! $quarSum->isEqualTo($totals['damaged'])
            || ! $rejSum->isEqualTo($totals['rejected'])) {
            throw new RuntimeException('Stage 2 receiving lot conservation invariant failed.');
        }
    }

    private function isExactQuantityAtScale(mixed $raw, int $scale): bool
    {
        if (! is_string($raw) || preg_match(self::STOCK_QUANTITY_PATTERN, $raw) !== 1) {
            return false;
        }
        $frac = explode('.', $raw, 2)[1] ?? '';

        return strlen($frac) <= $scale;
    }

    /** @param list<string> $requiredKeys */
    private function hasExactKeys(array $data, array $requiredKeys): bool
    {
        $keys = array_keys($data);
        sort($keys);
        $expected = $requiredKeys;
        sort($expected);

        return $keys === $expected;
    }

    private function isUuid(mixed $value): bool
    {
        return is_string($value) && preg_match(AuthInput::UUID, $value) === 1;
    }
}
