<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

/**
 * Nonposting internal application boundary for InventoryCustody queries, holds, and warehouse summaries.
 * Sibling modules (RequisitionsFulfillment, SalesFinance, DocumentsReporting) consume these operations
 * rather than reading or locking InventoryCustody balance/guard tables directly.
 */
interface InventoryLedgerParticipant
{
    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function queryEligibility(int $chapterId, int $itemVariantId, array $context = []): array;

    public function variantScale(int $chapterId, int $variantId): ?int;

    /** @return array<int, array{on_hand: string, rf: string}> */
    public function warehouseSummaries(int $chapterId): array;

    /** @return array{scale: int, on_hand: string, rf: string, guard_version: int}|null */
    public function lockVariantAndReadWarehouse(int $chapterId, int $variantId): ?array;

    /** @return array{id: int, item_variant_id: int, stock_lot_id: int, unit_scale: int, position_version: int, guard_version: int, on_hand_qty: string, reserved_qty: string, held_qty: string, is_usable: bool, location_kind: string, lot_code: string|null, location_code: string, condition_code: string}|null */
    public function positionSnapshot(int $chapterId, int $positionId, bool $lock = false): ?array;

    /** @return list<array{id: int, item_variant_id: int, stock_lot_id: int, unit_scale: int, position_version: int, on_hand_qty: string, reserved_qty: string, held_qty: string, blocked_qty: string, lot_code: string|null, location_code: string, condition_code: string, item_name: string, intervals: list<array<string, mixed>>}> */
    public function usableWarehousePositions(int $chapterId, ?int $variantId = null): array;

    /** @return list<array{variant_id: int, sku: string, item_name: string, variant_code: string, unit_scale: int, on_hand_qty: string, reserved_qty: string, is_usable_for_issue: bool, location_kind: string}> */
    public function allStockPositionSummaries(int $chapterId): array;

    /** @return array{cell_ids: list<int>, summary: array{reserved: string, held: string, blocked: string, position_version: int, variant_guard_version: int}}|null */
    public function reserveInterval(int $chapterId, int $variantId, int $positionId, string $startMicro, string $qtyMicro, string $resRef, string $now): ?array;

    public function releaseReservationByRef(int $chapterId, int $variantId, int $positionId, string $resRef, string $now): void;

    public function blockedOverlapByRef(int $chapterId, string $resRef): string;

    /**
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $input
     * @return array{http_status: int, body: array<string, mixed>}
     */
    public function recordStockHold(int $chapterId, array $actor, string $idempotencyKey, array $input): array;

    /**
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $input
     * @return array{http_status: int, body: array<string, mixed>}
     */
    public function clearStockHold(int $chapterId, array $actor, string $idempotencyKey, array $input): array;

    /** @return array{http_status: int, body: array<string, mixed>} */
    public function lookupUncertainAttempt(int $chapterId, string $actionCode, string $idempotencyKey): array;
}
