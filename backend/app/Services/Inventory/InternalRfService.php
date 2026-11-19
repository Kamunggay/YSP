<?php

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\DutyGrant;
use App\Models\Handover;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InternalRfVersion;
use App\Models\InventoryMovement;
use App\Models\StockReservation;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\BcMath;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InternalRfService
{
    public function __construct(
        protected ReferenceSequenceService $referenceSequences,
        protected DomainNotificationOutboxService $outbox
    ) {}

    public function createDraft(string $chapterId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $purpose = strtolower((string) ($input['purpose'] ?? 'internal_use'));
        if ($purpose !== 'internal_use') {
            throw new ContractException(422, 'invalid_input', 'Only internal_use purpose is permitted for Internal RF.');
        }

        return DB::transaction(function () use ($chapterId, $actorId, $input, $actionKey) {
            $rf = InternalRf::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'rf_number' => null,
                'requester_user_id' => $actorId,
                'requesting_unit_id' => $input['requesting_unit_id'] ?? null,
                'event_id' => $input['event_id'] ?? null,
                'purpose' => 'INTERNAL_USE',
                'justification' => $input['justification'] ?? null,
                'needed_at' => $input['needed_at'] ?? null,
                'status' => 'draft',
                'fulfillment_status' => 'not_approved',
                'version' => 1,
                'material_version' => 1,
                'progress_version' => 1,
            ]);

            $this->syncLines($rf, $input['lines'] ?? []);
            $rf->load('lines');

            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'created', $actorId, null, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'createInternalRf',
                $actionKey,
                $rf,
                201,
                $formatted,
                $input
            );
        });
    }

    public function replaceDraft(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $purpose = strtolower((string) ($input['purpose'] ?? 'internal_use'));
        if ($purpose !== 'internal_use') {
            throw new ContractException(422, 'invalid_input', 'Only internal_use purpose is permitted for Internal RF.');
        }

        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if (! in_array($rf->status, ['draft', 'returned'], true)) {
                throw new ContractException(409, 'state_conflict', "Cannot replace RF draft in status {$rf->status}.", [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: false);

            $rf->requesting_unit_id = array_key_exists('requesting_unit_id', $input) ? $input['requesting_unit_id'] : $rf->requesting_unit_id;
            $rf->event_id = array_key_exists('event_id', $input) ? $input['event_id'] : $rf->event_id;
            $rf->needed_at = array_key_exists('needed_at', $input) ? $input['needed_at'] : $rf->needed_at;
            $rf->justification = array_key_exists('justification', $input) ? $input['justification'] : $rf->justification;
            $rf->version += 1;
            $rf->material_version += 1;
            $rf->save();

            if (array_key_exists('lines', $input)) {
                $this->syncLines($rf, $input['lines'] ?? [], preserveLineIds: true);
            }

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'draft_replaced', $actorId, $input['reason'] ?? null, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'replaceInternalRfDraft',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    public function submit(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if (! in_array($rf->status, ['draft', 'returned'], true)) {
                throw new ContractException(409, 'state_conflict', "Cannot submit RF in status {$rf->status}.", [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: false);
            $this->validateCompletenessForSubmission($rf);

            if ($rf->rf_number === null) {
                $seq = $this->referenceSequences->nextReference($chapterId, 'RF');
                $rf->rf_number = $seq['reference'];
            }

            $rf->status = 'submitted';
            $rf->submitted_at = now();
            $rf->return_reason = null;
            $rf->version += 1;
            $rf->save();

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'submitted', $actorId, null, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'submitInternalRf',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    public function approve(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if ($rf->status !== 'submitted') {
                throw new ContractException(409, 'state_conflict', "Cannot approve RF in status {$rf->status}.", [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: false);

            $grant = $this->resolveApprovalGrantAndCheckIndependence($chapterId, $rf, $actorId);

            // Snapshot identity_at_approval and lock approved quantities
            foreach ($rf->lines as $line) {
                $variant = CatalogueVariant::where('chapter_id', $chapterId)->where('id', $line->variant_id)->first();
                $unit = CatalogueUnit::where('chapter_id', $chapterId)->where('id', $line->unit_id)->first();

                $line->approved_quantity = $line->requested_quantity;
                $line->identity_at_approval = [
                    'variant_id' => $line->variant_id,
                    'variant_code' => $variant?->code ?? $variant?->sku,
                    'variant_label' => $variant?->label ?? $variant?->name ?? 'Item Variant',
                    'variant_material_version' => (int) ($variant?->material_version ?? 1),
                    'unit_id' => $line->unit_id,
                    'unit_code' => $unit?->code ?? 'PCS',
                    'quantity_scale' => (int) ($unit?->quantity_scale ?? $variant?->quantity_scale ?? 0),
                    'unit_material_version' => (int) ($unit?->material_version ?? 1),
                ];
                $line->save();
            }

            $rf->status = 'approved';
            $rf->fulfillment_status = 'outstanding';
            $rf->approved_at = now();
            $rf->approved_by_user_id = $actorId;
            $rf->approved_duty_grant_id = $grant?->id;
            $rf->approved_alternate_id = ($grant && $grant->is_alternate) ? $grant->id : null;
            $rf->approved_material_version = $rf->material_version;
            $rf->version += 1;
            $rf->save();

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'approved', $actorId, null, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'approveInternalRf',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    public function returnForRevision(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $reason = trim((string) ($input['reason'] ?? ''));
        if ($reason === '') {
            throw new ContractException(422, 'invalid_input', 'A non-empty reason is required to return an RF.');
        }

        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $reason, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if ($rf->status !== 'submitted') {
                throw new ContractException(409, 'state_conflict', "Cannot return RF in status {$rf->status}.", [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: false);
            $this->resolveApprovalGrantAndCheckIndependence($chapterId, $rf, $actorId);

            $rf->status = 'returned';
            $rf->return_reason = $reason;
            $rf->version += 1;
            $rf->save();

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'returned', $actorId, $reason, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'returnInternalRf',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    public function revise(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $reason = trim((string) ($input['reason'] ?? ''));
        if ($reason === '') {
            throw new ContractException(422, 'invalid_input', 'A non-empty reason is required to revise an RF.');
        }

        $purpose = strtolower((string) ($input['purpose'] ?? 'internal_use'));
        if ($purpose !== 'internal_use') {
            throw new ContractException(422, 'invalid_input', 'Only internal_use purpose is permitted for Internal RF.');
        }

        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $reason, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if (! in_array($rf->status, ['returned', 'approved'], true)) {
                throw new ContractException(409, 'state_conflict', "Cannot revise RF in status {$rf->status}.", [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: true);

            if ($rf->status === 'approved') {
                $this->assertNoActiveCommitmentsOrIssues($rf, allowIssuedLines: false);
                $rf->fulfillment_status = 'not_approved';
                $rf->approved_at = null;
                $rf->approved_by_user_id = null;
                $rf->approved_duty_grant_id = null;
                $rf->approved_alternate_id = null;
                $rf->approved_material_version = null;
            }

            $rf->requesting_unit_id = array_key_exists('requesting_unit_id', $input) ? $input['requesting_unit_id'] : $rf->requesting_unit_id;
            $rf->event_id = array_key_exists('event_id', $input) ? $input['event_id'] : $rf->event_id;
            $rf->needed_at = array_key_exists('needed_at', $input) ? $input['needed_at'] : $rf->needed_at;
            $rf->justification = array_key_exists('justification', $input) ? $input['justification'] : $rf->justification;
            $rf->status = 'draft';
            $rf->return_reason = null;
            $rf->version += 1;
            $rf->material_version += 1;
            $rf->save();

            if (array_key_exists('lines', $input)) {
                $this->syncLines($rf, $input['lines'] ?? [], preserveLineIds: true, resetApproval: true);
            }

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'revised', $actorId, $reason, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'reviseInternalRf',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    public function cancel(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $reason = trim((string) ($input['reason'] ?? ''));
        if ($reason === '') {
            throw new ContractException(422, 'invalid_input', 'A non-empty reason is required to cancel an RF.');
        }

        return DB::transaction(function () use ($chapterId, $rfId, $actorId, $input, $reason, $actionKey) {
            $rf = $this->lockRfOrFail($chapterId, $rfId);

            if ($rf->status === 'canceled') {
                throw new ContractException(409, 'state_conflict', 'RF is already canceled.', [
                    'current' => $this->formatRf($rf),
                ]);
            }

            if ($rf->fulfillment_status === 'fulfilled') {
                throw new ContractException(409, 'state_conflict', 'Already fulfilled RF cannot be canceled.', [
                    'current' => $this->formatRf($rf),
                ]);
            }

            $this->assertExpectedVersions($rf, $input, checkProgress: true);

            if ($rf->status === 'approved') {
                $this->assertNoActiveCommitmentsOrIssues($rf, allowIssuedLines: true);

                foreach ($rf->lines as $line) {
                    $approved = BcMath::str($line->approved_quantity);
                    $issued = BcMath::str($line->issued_quantity);
                    $remainder = BcMath::sub($approved, $issued);
                    if (BcMath::comp($remainder, '0') > 0) {
                        $line->canceled_quantity = BcMath::add($line->canceled_quantity, $remainder);
                        $line->save();
                    }
                }

                $rf->fulfillment_status = 'closed_canceled';
                $rf->progress_version += 1;
            } else {
                $rf->fulfillment_status = 'not_approved';
            }

            $rf->status = 'canceled';
            $rf->cancel_reason = $reason;
            $rf->closed_at = now();
            $rf->version += 1;
            $rf->save();

            $rf = $rf->fresh('lines');
            $formatted = $this->formatRf($rf);
            $this->recordVersion($rf, 'canceled', $actorId, $reason, $formatted);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);

            return $this->buildOperationEnvelope(
                $chapterId,
                $actorId,
                'cancelInternalRf',
                $actionKey,
                $rf,
                200,
                $formatted,
                $input
            );
        });
    }

    /**
     * Format InternalRf strictly conforming to contracts/stage1/openapi.yaml#/components/schemas/InternalRf
     *
     * @return array<string, mixed>
     */
    public function formatRf(InternalRf $rf): array
    {
        $rf->loadMissing('lines');
        $isPreApproval = in_array($rf->status, ['draft', 'submitted', 'returned'], true)
            || ($rf->status === 'canceled' && $rf->fulfillment_status === 'not_approved');

        $lines = [];
        foreach ($rf->lines as $line) {
            $scale = (int) ($line->identity_at_approval['quantity_scale'] ?? 0);
            if ($scale === 0 && $line->variant_id) {
                $variant = CatalogueVariant::where('id', $line->variant_id)->first();
                $scale = (int) ($variant?->quantity_scale ?? 0);
            }

            if ($isPreApproval) {
                $progress = [
                    'approved_quantity' => null,
                    'issued_quantity' => '0',
                    'reserved_quantity' => '0',
                    'blocked_reserved_quantity' => '0',
                    'canceled_quantity' => '0',
                    'remaining_quantity' => null,
                    'unreserved_quantity' => null,
                ];
                $identityAtApproval = null;
            } else {
                $approved = BcMath::str($line->approved_quantity);
                $issued = BcMath::str($line->issued_quantity);
                $reserved = BcMath::str($line->reserved_quantity);
                $blocked = BcMath::str($line->blocked_reserved_quantity);
                $canceled = BcMath::str($line->canceled_quantity);

                $remaining = BcMath::sub(BcMath::sub($approved, $issued), $canceled);
                if (BcMath::comp($remaining, '0') < 0) {
                    $remaining = BcMath::str('0');
                }
                $unreserved = BcMath::sub($remaining, $reserved);
                if (BcMath::comp($unreserved, '0') < 0) {
                    $unreserved = BcMath::str('0');
                }

                $progress = [
                    'approved_quantity' => BcMath::format($approved, $scale),
                    'issued_quantity' => BcMath::format($issued, $scale),
                    'reserved_quantity' => BcMath::format($reserved, $scale),
                    'blocked_reserved_quantity' => BcMath::format($blocked, $scale),
                    'canceled_quantity' => BcMath::format($canceled, $scale),
                    'remaining_quantity' => BcMath::format($remaining, $scale),
                    'unreserved_quantity' => BcMath::format($unreserved, $scale),
                ];
                $identityAtApproval = $line->identity_at_approval;
            }

            $lines[] = [
                'id' => $line->id,
                'line_order' => (int) $line->line_order,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'requested_quantity' => $line->requested_quantity !== null ? BcMath::format($line->requested_quantity, $scale) : null,
                'identity_at_approval' => $identityAtApproval,
                'progress' => $progress,
                'notes' => $line->notes,
            ];
        }

        $approval = null;
        if ($rf->approved_at !== null || $rf->approved_by_user_id !== null) {
            $approval = [
                'approved_by' => [
                    'user_id' => $rf->approved_by_user_id,
                    'chapter_id' => $rf->chapter_id,
                    'duty_grant_id' => $rf->approved_duty_grant_id,
                    'alternate_grant_id' => $rf->approved_alternate_id,
                ],
                'approved_at' => $rf->approved_at?->format('Y-m-d\TH:i:s.u\Z'),
                'approved_material_version' => $rf->approved_material_version,
                'approval_route_policy_id' => $rf->approval_route_policy_id,
            ];
        }

        return [
            'id' => $rf->id,
            'chapter_id' => $rf->chapter_id,
            'reference' => $rf->rf_number,
            'status' => $rf->status,
            'version' => (int) $rf->version,
            'material_version' => (int) $rf->material_version,
            'progress_version' => (int) $rf->progress_version,
            'requester_id' => $rf->requester_user_id,
            'purpose' => 'internal_use',
            'requesting_unit_id' => $rf->requesting_unit_id,
            'event_id' => $rf->event_id,
            'needed_at' => $rf->needed_at?->format('Y-m-d\TH:i:s.u\Z'),
            'justification' => $rf->justification,
            'lines' => $lines,
            'approval' => $approval,
            'fulfillment' => $rf->fulfillment_status,
            'return_reason' => $rf->return_reason,
            'cancel_reason' => $rf->cancel_reason,
            'created_by' => [
                'user_id' => $rf->requester_user_id,
                'chapter_id' => $rf->chapter_id,
            ],
            'created_at' => $rf->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            'updated_at' => $rf->updated_at?->format('Y-m-d\TH:i:s.u\Z'),
            'submitted_at' => $rf->submitted_at?->format('Y-m-d\TH:i:s.u\Z'),
            'closed_at' => $rf->closed_at?->format('Y-m-d\TH:i:s.u\Z'),
            'setup_blockers' => [],
            'advancement_blockers' => [],
        ];
    }

    public function lockRfOrFail(string $chapterId, string $rfId): InternalRf
    {
        $rf = InternalRf::where('chapter_id', $chapterId)
            ->where('id', $rfId)
            ->lockForUpdate()
            ->first();

        if (! $rf) {
            throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} was not found in chapter {$chapterId}.");
        }

        $rf->load('lines');

        return $rf;
    }

    private function assertExpectedVersions(InternalRf $rf, array $input, bool $checkProgress): void
    {
        if (isset($input['expected_version']) && (int) $input['expected_version'] !== (int) $rf->version) {
            throw new ContractException(409, 'version_conflict', 'expected_version does not match current RF version.', [
                'current' => $this->formatRf($rf),
            ]);
        }

        if (isset($input['expected_material_version']) && (int) $input['expected_material_version'] !== (int) $rf->material_version) {
            throw new ContractException(409, 'material_version_conflict', 'expected_material_version does not match current RF material_version.', [
                'current' => $this->formatRf($rf),
            ]);
        }

        if ($checkProgress && isset($input['expected_progress_version']) && (int) $input['expected_progress_version'] !== (int) $rf->progress_version) {
            throw new ContractException(409, 'progress_version_conflict', 'expected_progress_version does not match current RF progress_version.', [
                'current' => $this->formatRf($rf),
            ]);
        }
    }

    private function validateCompletenessForSubmission(InternalRf $rf): void
    {
        if (! $rf->requesting_unit_id || ! $rf->needed_at || ! $rf->justification || trim($rf->justification) === '') {
            throw new ContractException(422, 'rf_incomplete', 'requesting_unit_id, needed_at, and justification are required before submission.');
        }

        if ($rf->lines->isEmpty()) {
            throw new ContractException(422, 'rf_incomplete', 'At least one line item is required before submission.');
        }

        foreach ($rf->lines as $line) {
            if (! $line->variant_id || ! $line->unit_id || $line->requested_quantity === null || BcMath::comp($line->requested_quantity, '0') <= 0) {
                throw new ContractException(422, 'rf_incomplete', 'All RF lines must specify variant_id, unit_id, and positive requested_quantity.');
            }

            $variant = CatalogueVariant::where('chapter_id', $rf->chapter_id)->where('id', $line->variant_id)->first();
            if ($variant && ($variant->state ?? 'active') !== 'active') {
                throw new ContractException(409, 'setup_blocked', "Variant {$line->variant_id} is not active.", [
                    'setup_blockers' => [['subject_id' => $line->variant_id, 'state' => $variant->state]],
                ]);
            }

            $unit = CatalogueUnit::where('chapter_id', $rf->chapter_id)->where('id', $line->unit_id)->first();
            if ($unit && ($unit->state ?? 'active') !== 'active') {
                throw new ContractException(409, 'setup_blocked', "Unit {$line->unit_id} is not active.", [
                    'setup_blockers' => [['subject_id' => $line->unit_id, 'state' => $unit->state]],
                ]);
            }
        }
    }

    private function resolveApprovalGrantAndCheckIndependence(string $chapterId, InternalRf $rf, string $actorId): ?DutyGrant
    {
        $now = now();
        $grants = DutyGrant::where('chapter_id', $chapterId)
            ->where('user_id', $actorId)
            ->where('duty_code', 'RF_APPROVER')
            ->where('status', 'active')
            ->get()
            ->filter(function (DutyGrant $g) use ($now): bool {
                if ($g->valid_from && $g->valid_from->isAfter($now)) {
                    return false;
                }
                if ($g->valid_until && $g->valid_until->isBefore($now)) {
                    return false;
                }

                return true;
            });

        $grant = $grants->first();

        if ($rf->requester_user_id === $actorId) {
            $alternateGrant = $grants->first(fn (DutyGrant $g) => (bool) $g->is_alternate);
            if (! $alternateGrant) {
                throw new ContractException(403, 'independence_required', 'independence required');
            }

            return $alternateGrant;
        }

        return $grant;
    }

    private function assertNoActiveCommitmentsOrIssues(InternalRf $rf, bool $allowIssuedLines): void
    {
        if (! $allowIssuedLines) {
            foreach ($rf->lines as $line) {
                if (BcMath::isPositive($line->issued_quantity)) {
                    throw new ContractException(409, 'commitment_conflict', 'commitment conflict', [
                        'current' => $this->formatRf($rf),
                    ]);
                }
            }
        }

        $hasActiveReservation = StockReservation::where('chapter_id', $rf->chapter_id)
            ->where('source_type', 'RF')
            ->where('source_id', $rf->id)
            ->where('status', 'ACTIVE')
            ->exists();

        if ($hasActiveReservation) {
            throw new ContractException(409, 'commitment_conflict', 'commitment conflict', [
                'current' => $this->formatRf($rf),
            ]);
        }

        foreach ($rf->lines as $line) {
            if (BcMath::isPositive($line->reserved_quantity)) {
                throw new ContractException(409, 'commitment_conflict', 'commitment conflict', [
                    'current' => $this->formatRf($rf),
                ]);
            }
        }

        $hasUnpostedIssues = ActualIssue::where('chapter_id', $rf->chapter_id)
            ->where('requisition_id', $rf->id)
            ->whereIn('status', ['prepared', 'acknowledged'])
            ->exists();

        if ($hasUnpostedIssues) {
            throw new ContractException(409, 'commitment_conflict', 'Prepared or unposted actual issues block RF modification.', [
                'current' => $this->formatRf($rf),
            ]);
        }

        $hasUnresolvedHandover = Handover::where('chapter_id', $rf->chapter_id)
            ->where('source_type', 'REQUISITION')
            ->where('source_id', $rf->id)
            ->where('status', 'DRAFT')
            ->exists();

        if ($hasUnresolvedHandover) {
            throw new ContractException(409, 'handover_unresolved', 'Unresolved handover blocks RF modification.', [
                'current' => $this->formatRf($rf),
            ]);
        }
    }

    private function syncLines(InternalRf $rf, array $linesInput, bool $preserveLineIds = false, bool $resetApproval = false): void
    {
        $existingById = $rf->lines()->get()->keyBy('id');
        $keptIds = [];
        $order = 1;

        foreach ($linesInput as $lineData) {
            $lineId = $lineData['line_id'] ?? $lineData['id'] ?? null;
            if ($preserveLineIds && $lineId && $existingById->has($lineId)) {
                /** @var InternalRfLine $line */
                $line = $existingById->get($lineId);
                $line->line_order = $order++;
                $line->variant_id = $lineData['variant_id'] ?? null;
                $line->unit_id = $lineData['unit_id'] ?? null;
                $line->requested_quantity = isset($lineData['requested_quantity']) && $lineData['requested_quantity'] !== null
                    ? BcMath::str($lineData['requested_quantity'])
                    : null;
                $line->notes = $lineData['notes'] ?? $line->notes;
                if ($resetApproval) {
                    $line->approved_quantity = null;
                    $line->identity_at_approval = null;
                }
                $line->save();
                $keptIds[] = $line->id;
            } else {
                $newLine = InternalRfLine::create([
                    'id' => (string) Str::uuid(),
                    'rf_id' => $rf->id,
                    'line_order' => $order++,
                    'variant_id' => $lineData['variant_id'] ?? null,
                    'unit_id' => $lineData['unit_id'] ?? null,
                    'requested_quantity' => isset($lineData['requested_quantity']) && $lineData['requested_quantity'] !== null
                        ? BcMath::str($lineData['requested_quantity'])
                        : null,
                    'approved_quantity' => null,
                    'reserved_quantity' => '0.000000',
                    'blocked_reserved_quantity' => '0.000000',
                    'issued_quantity' => '0.000000',
                    'canceled_quantity' => '0.000000',
                    'identity_at_approval' => null,
                    'notes' => $lineData['notes'] ?? null,
                ]);
                $keptIds[] = $newLine->id;
            }
        }

        InternalRfLine::where('rf_id', $rf->id)
            ->whereNotIn('id', $keptIds)
            ->delete();
    }

    private function recordVersion(InternalRf $rf, string $eventType, string $actorId, ?string $reason, array $snapshot): void
    {
        InternalRfVersion::create([
            'id' => (string) Str::uuid(),
            'rf_id' => $rf->id,
            'chapter_id' => $rf->chapter_id,
            'version' => $rf->version,
            'material_version' => $rf->material_version,
            'progress_version' => $rf->progress_version,
            'event_type' => $eventType,
            'actor_user_id' => $actorId,
            'reason' => $reason,
            'snapshot_json' => $snapshot,
            'created_at' => now(),
        ]);
    }

    private function buildOperationEnvelope(
        string $chapterId,
        string $actorId,
        string $operationName,
        ?string $actionKey,
        InternalRf $rf,
        int $httpStatus,
        array $formattedResult,
        array $requestPayload
    ): array {
        $operationId = (string) Str::uuid();
        $effectiveKey = $actionKey ?? (string) Str::uuid();
        $envelope = [
            'data' => [
                'operation_id' => $operationId,
                'chapter_id' => $chapterId,
                'actor_id' => $actorId,
                'operation_name' => $operationName,
                'action_key' => $effectiveKey,
                'rf_id' => $rf->id,
                'committed_version' => (int) $rf->version,
                'committed_material_version' => (int) $rf->material_version,
                'committed_progress_version' => (int) $rf->progress_version,
                'committed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'http_status' => $httpStatus,
                'outcome' => 'committed',
                'result' => $formattedResult,
            ],
        ];

        if ($actionKey !== null) {
            IdempotencyRecord::create([
                'id' => $operationId,
                'key' => $actionKey,
                'chapter_id' => $chapterId,
                'user_id' => $actorId,
                'operation_name' => $operationName,
                'resource_id' => $rf->id,
                'state' => 'committed',
                'payload_hash' => CanonicalJson::sha256($requestPayload),
                'response_code' => $httpStatus,
                'response_body' => json_encode($envelope),
                'expires_at' => now()->addDays(7),
            ]);
        }

        return $envelope;
    }

    public function getRelatedRecords(string $chapterId, string $rfId): array
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->with('lines')->first();
        if (! $rf) {
            throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} not found.");
        }

        $reservations = StockReservation::where('chapter_id', $chapterId)
            ->where('source_type', 'RF')
            ->where('source_id', $rfId)
            ->with('allocations')
            ->get();

        $actualIssues = ActualIssue::where('chapter_id', $chapterId)
            ->where('requisition_id', $rfId)
            ->with('lines')
            ->get();

        $handovers = Handover::where('chapter_id', $chapterId)
            ->where('source_type', 'REQUISITION')
            ->where('source_id', $rfId)
            ->with(['lines', 'receipts'])
            ->get();

        $postingIds = $actualIssues->pluck('inventory_posting_id')->filter()->values()->all();
        $movements = empty($postingIds)
            ? collect()
            : InventoryMovement::where('chapter_id', $chapterId)->whereIn('posting_id', $postingIds)->get();

        return [
            'rf_id' => $rf->id,
            'reservations' => $reservations,
            'actual_issues' => $actualIssues,
            'handovers' => $handovers,
            'movements' => $movements,
        ];
    }
}
