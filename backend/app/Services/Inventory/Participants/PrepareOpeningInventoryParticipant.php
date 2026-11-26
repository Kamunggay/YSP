<?php

namespace App\Services\Inventory\Participants;

use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\ChapterOpeningGuard;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\OpeningFinding;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Services\Shared\BcMath;
use App\Services\Shared\CanonicalJson;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class PrepareOpeningInventoryParticipant
{
    private const MAX_PHP_VALUE = '999999999999.99';

    /**
     * Synchronous internal Inventory participant for postOpeningRm (PrepareOpeningInventoryInput -> PrepareOpeningInventoryResult).
     * Runs strictly inside the caller's outer database transaction and never commits separately.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function prepare(array $input, OpeningRm $openingRm, string $rmReference, CarbonInterface $postedAt): array
    {
        if (DB::transactionLevel() === 0) {
            throw new RuntimeException('PrepareOpeningInventoryParticipant requires an active outer transaction.');
        }

        $chapterId = (string) ($input['chapter_id'] ?? '');
        $actorId = (string) ($input['actor_id'] ?? '');
        $snapshot = is_array($input['snapshot'] ?? null) ? $input['snapshot'] : null;
        $acknowledgment = is_array($input['acknowledgment'] ?? null) ? $input['acknowledgment'] : null;
        $expectedStockVersion = (int) ($input['current_stock_version'] ?? 0);

        if ($chapterId === '' || $actorId === '' || $snapshot === null || $acknowledgment === null
            || $openingRm->chapter_id !== $chapterId
            || ($snapshot['chapter_id'] ?? null) !== $chapterId
            || ($snapshot['rm_id'] ?? null) !== $openingRm->id
            || ($acknowledgment['snapshot']['target']['purpose'] ?? null) !== 'opening_receipt'
            || ($acknowledgment['snapshot']['target']['record_id'] ?? null) !== $openingRm->id
            || ! hash_equals(CanonicalJson::sha256($snapshot), (string) ($acknowledgment['snapshot']['sha256'] ?? ''))) {
            return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
        }

        $guard = ChapterOpeningGuard::where('chapter_id', $chapterId)->lockForUpdate()->first();
        if (! $guard) {
            return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
        }
        if ($guard->posted_rm_id !== null) {
            return ['outcome' => 'rejected', 'reason' => 'baseline_already_posted'];
        }
        if ((int) $guard->stock_version !== $expectedStockVersion) {
            return ['outcome' => 'rejected', 'reason' => 'stale_version'];
        }

        $ipcId = (string) ($snapshot['ipc_id'] ?? '');
        $ipcRef = (string) ($snapshot['ipc_reference'] ?? '');
        $ipcMaterialVersion = (int) ($snapshot['ipc_material_version'] ?? 0);
        $rmMaterialVersion = (int) ($snapshot['rm_material_version'] ?? 0);
        $ipcLines = $snapshot['material']['lines'] ?? [];
        $rmLines = $snapshot['rm_material']['lines'] ?? [];
        $inspectionNotes = (string) ($snapshot['inspection']['inspection_notes'] ?? 'Opening receiving inspection finding');

        if ($ipcId === '' || $ipcRef === '' || $ipcMaterialVersion < 1 || $rmMaterialVersion < 1
            || ! is_array($ipcLines) || $ipcLines === [] || ! is_array($rmLines) || count($rmLines) !== count($ipcLines)) {
            return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
        }

        $ipcById = [];
        foreach ($ipcLines as $line) {
            $lid = (string) ($line['line_id'] ?? '');
            if ($lid === '' || isset($ipcById[$lid])) {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }
            $ipcById[$lid] = $line;
        }

        // Lock catalogue dependencies in deterministic UUID order.
        $itemIds = array_values(array_unique(array_column($ipcLines, 'item_id')));
        $variantIds = array_values(array_unique(array_column($ipcLines, 'variant_id')));
        $unitIds = array_values(array_unique(array_column($ipcLines, 'unit_id')));
        $locationIds = array_values(array_unique(array_column($ipcLines, 'location_id')));
        sort($itemIds);
        sort($variantIds);
        sort($unitIds);
        sort($locationIds);

        $items = CatalogueItem::where('chapter_id', $chapterId)->whereIn('id', $itemIds)->orderBy('id')->sharedLock()->get()->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $chapterId)->whereIn('id', $variantIds)->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)->whereIn('id', $unitIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        $locations = CatalogueLocation::where('chapter_id', $chapterId)->whereIn('id', $locationIds)->orderBy('id')->sharedLock()->get()->keyBy('id');

        usort($rmLines, fn (array $a, array $b) => strcmp((string) ($a['ipc_line_id'] ?? ''), (string) ($b['ipc_line_id'] ?? '')));

        $roundingMode = $this->resolveRoundingMode($chapterId, (array) ($snapshot['material']['policies'] ?? []));
        if ($roundingMode === null) {
            return ['outcome' => 'rejected', 'reason' => 'setup_blocked'];
        }

        $plan = [];
        $seen = [];
        $acceptedTotal = BigDecimal::zero();
        $maxPhp = BigDecimal::of(self::MAX_PHP_VALUE);

        foreach ($rmLines as $rmLine) {
            $lid = (string) ($rmLine['ipc_line_id'] ?? '');
            if ($lid === '' || isset($seen[$lid]) || ! isset($ipcById[$lid])) {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }
            $seen[$lid] = true;
            $src = $ipcById[$lid];

            $item = $items->get($src['item_id'] ?? '');
            $variant = $variants->get($src['variant_id'] ?? '');
            $unit = $units->get($src['unit_id'] ?? '');
            $location = $locations->get($src['location_id'] ?? '');
            $scale = (int) ($src['quantity_scale'] ?? -1);

            if (! $item || ! $variant || ! $unit || ! $location
                || $item->state !== 'active' || $variant->state !== 'active'
                || $unit->state !== 'active' || $location->state !== 'active'
                || $variant->item_id !== $item->id
                || (int) $variant->material_version !== (int) ($src['variant_material_version'] ?? 0)
                || (int) $unit->material_version !== (int) ($src['unit_material_version'] ?? 0)
                || (int) $location->material_version !== (int) ($src['location_material_version'] ?? 0)
                || (int) $unit->quantity_scale !== $scale
                || ($variant->quantity_scale !== null && (int) $variant->quantity_scale !== $scale)) {
                return ['outcome' => 'rejected', 'reason' => 'stale_version'];
            }

            $accStr = (string) ($rmLine['accepted_quantity'] ?? '');
            $dmgStr = (string) ($rmLine['damaged_quantity'] ?? '');
            $rejStr = (string) ($rmLine['rejected_quantity'] ?? '');
            $valStr = (string) ($rmLine['accepted_value'] ?? '');
            $unitValStr = (string) ($src['unit_value'] ?? '');

            if ($accStr === '' || $dmgStr === '' || $rejStr === '' || $valStr === '' || $unitValStr === '') {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }

            foreach ([$accStr, $dmgStr, $rejStr] as $q) {
                $frac = explode('.', $q, 2)[1] ?? '';
                if (strlen($frac) > $scale) {
                    return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
                }
            }

            $acc = BigDecimal::of($accStr);
            $dmg = BigDecimal::of($dmgStr);
            $rej = BigDecimal::of($rejStr);
            $val = BigDecimal::of($valStr);

            if ($acc->isNegative() || $dmg->isNegative() || $rej->isNegative() || $val->isNegative()
                || ! $acc->plus($dmg)->plus($rej)->isEqualTo((string) ($src['counted_quantity'] ?? ''))
                || (($src['condition'] ?? '') !== 'usable' && $acc->isPositive())
                || ($acc->isZero() && ! $val->isZero())) {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }

            $expectedLineValue = $acc->multipliedBy($unitValStr)->toScale(2, $roundingMode);
            if ($expectedLineValue->isGreaterThan($maxPhp) || $valStr !== (string) $expectedLineValue) {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }

            $acceptedTotal = $acceptedTotal->plus($expectedLineValue);
            if ($acceptedTotal->isGreaterThan($maxPhp)) {
                return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
            }

            $plan[] = [
                'ipc_line' => $src,
                'rm_line' => $rmLine,
                'unit' => $unit,
                'location' => $location,
                'scale' => $scale,
                'acc' => $acc,
                'dmg' => $dmg,
                'rej' => $rej,
            ];
        }

        if (count($seen) !== count($ipcById)) {
            return ['outcome' => 'rejected', 'reason' => 'invalid_source'];
        }

        $outcomeId = (string) Str::uuid();
        $nextStockVersion = $expectedStockVersion + 1;
        $postedAtStr = $postedAt->utc()->format('Y-m-d\TH:i:s.u\Z');

        $posting = InventoryPosting::create([
            'id' => $outcomeId,
            'chapter_id' => $chapterId,
            'posting_reference' => $rmReference,
            'source_type' => 'IPC',
            'source_id' => $openingRm->id,
            'actor_id' => $actorId,
            'notes' => 'Opening baseline physical movement commit',
            'created_at' => $postedAt,
        ]);

        $movementsOut = [];
        $findingsOut = [];
        $lotsOut = [];
        $sourceMeta = [
            'kind' => 'ipc_rm',
            'source_id' => $ipcId,
            'source_reference' => $ipcRef,
            'source_material_version' => $ipcMaterialVersion,
            'accepted_rm_id' => $openingRm->id,
            'accepted_rm_reference' => $rmReference,
            'accepted_rm_version' => $rmMaterialVersion,
            'donor_id' => null,
        ];

        foreach ($plan as $entry) {
            $src = $entry['ipc_line'];
            $rmLine = $entry['rm_line'];
            /** @var CatalogueUnit $unit */
            $unit = $entry['unit'];
            /** @var CatalogueLocation $location */
            $location = $entry['location'];
            $scale = $entry['scale'];
            $ipcLineId = $src['line_id'];
            $custodianId = $location->custodian_id ?? ($src['regular_custodian_ids'][0] ?? null);
            $lotCode = 'OPENING-'.$ipcLineId;

            if ($entry['acc']->isPositive()) {
                $qtyFormatted = BcMath::format($rmLine['accepted_quantity'], $scale);
                $lotPayload = $this->createLot(
                    $chapterId, $src, $openingRm->id, $rmReference, $rmMaterialVersion,
                    $nextStockVersion, $lotCode, 'USABLE', 'usable', $custodianId,
                    $qtyFormatted, $sourceMeta, $postedAt, $postedAtStr,
                );
                $lotsOut[] = $lotPayload;

                if (! $unit->quantity_identity_locked) {
                    $unit->quantity_identity_locked = true;
                    $unit->save();
                }

                $mov = InventoryMovement::create([
                    'id' => (string) Str::uuid(),
                    'posting_id' => $posting->id,
                    'chapter_id' => $chapterId,
                    'variant_id' => $src['variant_id'],
                    'unit_id' => $src['unit_id'],
                    'location_id' => $src['location_id'],
                    'condition' => 'USABLE',
                    'quantity' => BcMath::str($qtyFormatted),
                    'balance_after' => BcMath::str($qtyFormatted),
                    'created_at' => $postedAt,
                    'movement_kind' => 'opening_accepted_receipt',
                    'source_rm_id' => $openingRm->id,
                    'source_ipc_id' => $ipcId,
                    'source_ipc_line_id' => $ipcLineId,
                    'lot_id' => $lotPayload['id'],
                    'rm_reference' => $rmReference,
                    'rm_material_version' => $rmMaterialVersion,
                    'ipc_reference' => $ipcRef,
                    'ipc_material_version' => $ipcMaterialVersion,
                    'quantity_scale' => $scale,
                    'accepted_value' => $rmLine['accepted_value'],
                    'currency' => 'PHP',
                    'posted_by' => $actorId,
                ]);

                $movementsOut[] = [
                    'id' => $mov->id,
                    'chapter_id' => $chapterId,
                    'kind' => 'opening_accepted_receipt',
                    'rm_id' => $openingRm->id,
                    'rm_reference' => $rmReference,
                    'rm_material_version' => $rmMaterialVersion,
                    'ipc_id' => $ipcId,
                    'ipc_reference' => $ipcRef,
                    'ipc_material_version' => $ipcMaterialVersion,
                    'ipc_line_id' => $ipcLineId,
                    'lot_id' => $lotPayload['id'],
                    'variant_id' => $src['variant_id'],
                    'unit_id' => $src['unit_id'],
                    'location_id' => $src['location_id'],
                    'quantity' => $qtyFormatted,
                    'value' => $rmLine['accepted_value'],
                    'currency' => 'PHP',
                    'condition' => 'usable',
                    'posted_by' => $actorId,
                    'posted_at' => $postedAtStr,
                ];
            }

            foreach ([
                ['qty' => $entry['dmg'], 'raw' => $rmLine['damaged_quantity'], 'db_cond' => 'QUARANTINE', 'api_cond' => 'quarantined'],
                ['qty' => $entry['rej'], 'raw' => $rmLine['rejected_quantity'], 'db_cond' => 'REJECTED', 'api_cond' => 'rejected'],
            ] as $nonUsable) {
                if (! $nonUsable['qty']->isPositive()) {
                    continue;
                }
                $qtyFormatted = BcMath::format($nonUsable['raw'], $scale);
                $lotPayload = $this->createLot(
                    $chapterId, $src, $openingRm->id, $rmReference, $rmMaterialVersion,
                    $nextStockVersion, $lotCode, $nonUsable['db_cond'], $nonUsable['api_cond'], $custodianId,
                    $qtyFormatted, $sourceMeta, $postedAt, $postedAtStr,
                );
                $lotsOut[] = $lotPayload;

                $reason = is_string($rmLine['finding_reason'] ?? null) && trim($rmLine['finding_reason']) !== ''
                    ? $rmLine['finding_reason']
                    : $inspectionNotes;

                $finding = OpeningFinding::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'rm_id' => $openingRm->id,
                    'ipc_id' => $ipcId,
                    'ipc_line_id' => $ipcLineId,
                    'lot_id' => $lotPayload['id'],
                    'variant_id' => $src['variant_id'],
                    'unit_id' => $src['unit_id'],
                    'location_id' => $src['location_id'],
                    'condition' => $nonUsable['api_cond'],
                    'quantity' => BcMath::str($qtyFormatted),
                    'quantity_scale' => $scale,
                    'reason' => $reason,
                    'recorded_by' => $actorId,
                    'recorded_at' => $postedAt,
                    'resolution' => 'requires_later_approved_treatment',
                ]);

                $findingsOut[] = [
                    'id' => $finding->id,
                    'chapter_id' => $chapterId,
                    'rm_id' => $openingRm->id,
                    'ipc_id' => $ipcId,
                    'ipc_line_id' => $ipcLineId,
                    'lot_id' => $lotPayload['id'],
                    'variant_id' => $src['variant_id'],
                    'unit_id' => $src['unit_id'],
                    'location_id' => $src['location_id'],
                    'condition' => $nonUsable['api_cond'],
                    'quantity' => $qtyFormatted,
                    'reason' => $reason,
                    'recorded_by' => $actorId,
                    'recorded_at' => $postedAtStr,
                    'resolution' => 'requires_later_approved_treatment',
                ];
            }
        }

        usort($movementsOut, fn (array $a, array $b) => strcmp($a['id'], $b['id']));
        usort($findingsOut, fn (array $a, array $b) => strcmp($a['id'], $b['id']));
        usort($lotsOut, fn (array $a, array $b) => strcmp($a['id'], $b['id']));

        return [
            'outcome' => 'ready',
            'posting' => [
                'id' => $outcomeId,
                'chapter_id' => $chapterId,
                'rm_id' => $openingRm->id,
                'ipc_id' => $ipcId,
                'posted_at' => $postedAtStr,
                'stock_version' => $nextStockVersion,
                'movements' => $movementsOut,
                'findings' => $findingsOut,
                'lots' => $lotsOut,
                'accepted_value' => (string) $acceptedTotal->toScale(2),
                'currency' => 'PHP',
                'baseline_locked' => true,
                'acknowledgment_id' => (string) $acknowledgment['acknowledgment_id'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function createLot(
        string $chapterId,
        array $src,
        string $rmId,
        string $rmReference,
        int $rmMaterialVersion,
        int $stockVersion,
        string $lotCode,
        string $dbCondition,
        string $apiCondition,
        ?string $custodianId,
        string $qtyFormatted,
        array $sourceMeta,
        CarbonInterface $postedAt,
        string $postedAtStr,
    ): array {
        $lotId = (string) Str::uuid();
        $segmentId = (string) Str::uuid();
        $segment = [
            'id' => $segmentId,
            'quantity' => $qtyFormatted,
            'reservation' => null,
            'hold_ids' => [],
            'restrictions' => $src['restrictions'],
            'basis_segment_id' => $segmentId,
            'offset_quantity' => '0',
        ];

        InventoryLot::create([
            'id' => $lotId,
            'chapter_id' => $chapterId,
            'variant_id' => $src['variant_id'],
            'unit_id' => $src['unit_id'],
            'location_id' => $src['location_id'],
            'lot_code' => $lotCode,
            'basis_segment_id' => $segmentId,
            'condition' => $dbCondition,
            'custody' => 'STOCKROOM',
            'custodian_user_id' => $custodianId,
            'quantity_on_hand' => BcMath::str($qtyFormatted),
            'original_quantity' => BcMath::str($qtyFormatted),
            'quantity_scale' => (int) $src['quantity_scale'],
            'segments' => [$segment],
            'stock_version' => $stockVersion,
            'historical_variant_label' => $src['historical_variant_label'],
            'material_version' => $rmMaterialVersion,
            'source_type' => 'IPC',
            'source_id' => $rmId,
            'source_reference' => $rmReference,
            'created_at' => $postedAt,
            'updated_at' => $postedAt,
        ]);

        return [
            'id' => $lotId,
            'chapter_id' => $chapterId,
            'material_version' => $rmMaterialVersion,
            'stock_version' => $stockVersion,
            'variant_id' => $src['variant_id'],
            'variant_material_version' => (int) $src['variant_material_version'],
            'item_id' => $src['item_id'],
            'unit_id' => $src['unit_id'],
            'unit_material_version' => (int) $src['unit_material_version'],
            'quantity_scale' => (int) $src['quantity_scale'],
            'historical_variant_label' => $src['historical_variant_label'],
            'location_id' => $src['location_id'],
            'custodian_id' => $custodianId,
            'condition' => $apiCondition,
            'custody' => 'stockroom',
            'source' => $sourceMeta,
            'quantity' => $qtyFormatted,
            'segments' => [$segment],
            'created_at' => $postedAtStr,
            'observed_at' => $postedAtStr,
        ];
    }

    private function resolveRoundingMode(string $chapterId, array $policies): ?RoundingMode
    {
        foreach ($policies as $binding) {
            if (($binding['setting_key'] ?? null) !== 'valuation_rounding') {
                continue;
            }
            $policy = PolicyRecord::where('chapter_id', $chapterId)
                ->where('policy_code', 'valuation_rounding')
                ->where('policy_version', (int) ($binding['version'] ?? 0))
                ->where(fn ($q) => $q->where('aggregate_id', $binding['policy_id'] ?? '')->orWhere('id', $binding['policy_id'] ?? ''))
                ->sharedLock()
                ->first();
            $mode = $policy?->rules_json['rounding_mode'] ?? null;

            return match ($mode) {
                'half_up' => RoundingMode::HalfUp,
                'half_even' => RoundingMode::HalfEven,
                'down' => RoundingMode::Down,
                default => null,
            };
        }

        return null;
    }
}
