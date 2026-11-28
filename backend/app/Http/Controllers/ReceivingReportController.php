<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\ReceivingInput;
use App\Http\Resources\ReceivingResource;
use App\Http\Resources\RepfResource;
use App\Models\Donation;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\ReceivingReport;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Receiving\ReceivingExceptionWorkflow;
use App\Services\Receiving\ReceivingReportWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\SnapshotPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReceivingReportController
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor', 'source_kind', 'status', 'source_id', 'location_id', 'q', 'eligible_for']);
        $query = ReceivingReport::where('chapter_id', $chapterId)->with(ReceivingReportWorkflow::RELATIONS);

        if (isset($selectors['source_kind'])) {
            $query->where('source_kind', $this->oneOf($selectors['source_kind'], ReceivingInput::SOURCE_KINDS));
        }
        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], ReceivingInput::REPORT_STATUSES));
        }
        if (isset($selectors['source_id'])) {
            $query->where('source_id', OpeningDraftInput::requireUuid($selectors['source_id'], 'source identifier'));
        }
        if (isset($selectors['location_id'])) {
            $query->where('location_id', OpeningDraftInput::requireUuid($selectors['location_id'], 'location identifier'));
        }
        $eligibleFor = isset($selectors['eligible_for'])
            ? $this->oneOf($selectors['eligible_for'], ReceivingInput::REPORT_ELIGIBLE_FOR)
            : null;
        if ($eligibleFor === 'discrepancy_replacement') {
            $query->where('source_kind', 'po')->where('status', 'posted');
        }

        $search = self::parseSearch($selectors);
        $rows = $query->orderByDesc('updated_at')->orderBy('id')->sharedLock()->get();
        if ($search !== null) {
            $rows = $rows->filter(fn (ReceivingReport $rm) => $this->matchesSearch($rm, $search));
        }

        $items = $rows->map(ReceivingResource::report(...))->values()->all();

        return self::page($request, $chapterId, 'receiving-reports', $selectors, $items);
    }

    public function show(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        ReceivingInput::selectors($request);
        $rm = $this->find($chapterId, $rmId)->load(ReceivingReportWorkflow::RELATIONS);

        return response()->json(['data' => ReceivingResource::report($rm)]);
    }

    public function movements(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor']);
        $rm = $this->find($chapterId, $rmId);
        $rows = InventoryMovement::where('chapter_id', $chapterId)
            ->where('source_rm_id', $rm->id)
            ->whereIn('movement_kind', ['accepted_receipt', 'quarantined_receipt', 'rejected_receipt'])
            ->orderBy('created_at')
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $items = $rows->map(ReceivingResource::movement(...))->values()->all();

        return self::page($request, $chapterId, "receiving-report-movements:{$rmId}", $selectors, $items);
    }

    public function discrepancies(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor']);
        $rm = $this->find($chapterId, $rmId);
        $rows = ReceivingDiscrepancy::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('rm_id', $rm->id)->orWhere('replacement_rm_id', $rm->id))
            ->with(ReceivingExceptionWorkflow::DISCREPANCY_RELATIONS)
            ->orderByDesc('updated_at')
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $items = $rows->map(ReceivingResource::discrepancy(...))->values()->all();

        return self::page($request, $chapterId, "receiving-report-discrepancies:{$rmId}", $selectors, $items);
    }

    public function history(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor']);
        $rm = $this->find($chapterId, $rmId);
        $rows = ReceivingReportWorkflow::history($rm)
            ->where('is_version_snapshot', true)
            ->orderByDesc('version')
            ->orderByDesc('sequence_no')
            ->orderByDesc('id')
            ->sharedLock()
            ->get();
        $actors = User::whereIn('id', $rows->pluck('actor_user_id')->unique())->get()->keyBy('id');

        $items = $rows->map(fn (Stage2RecordHistory $row) => [
            'id' => $row->id,
            'version' => (int) $row->version,
            'material_version' => (int) $row->material_version,
            'action' => $row->event_type,
            'from_status' => $row->operation_json['from_status'] ?? null,
            'to_status' => $row->snapshot_json['status'],
            'actor' => $row->operation_json['actor'] ?? RepfResource::actor($actors->get($row->actor_user_id)),
            'reason' => $row->reason,
            'rm_reference' => $row->snapshot_json['rm_reference'] ?? null,
            'evidence_binding_invalidated' => (bool) ($row->operation_json['evidence_binding_invalidated'] ?? false),
            'occurred_at' => RepfResource::instant($row->recorded_at),
        ])->values()->all();

        return self::page($request, $chapterId, "receiving-report-history:{$rmId}", $selectors, $items);
    }

    public function version(Request $request, string $chapterId, string $rmId, string $version): JsonResponse
    {
        ReceivingInput::selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $targetVersion = OpeningDraftInput::requireRevision($version);
        $rm = $this->find($chapterId, $rmId);
        $row = ReceivingReportWorkflow::history($rm)
            ->where('version', $targetVersion)
            ->where('is_version_snapshot', true)
            ->sharedLock()
            ->first() ?? throw ReceivingReportWorkflow::notFound();

        $snapshot = $row->snapshot_json;
        if (($snapshot['evidence_acknowledgment'] ?? null) !== null) {
            $authority->requireAction('evidence.read');
        }

        return response()->json(['data' => $snapshot]);
    }

    public function related(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor']);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $rm = $this->find($chapterId, $rmId);
        $links = [];

        if ($rm->source_kind === 'po' && $authority->allows('po.read')) {
            $po = PurchaseOrder::where('chapter_id', $chapterId)->whereKey($rm->source_id)->sharedLock()->first();
            if ($po) {
                $links[] = $this->link('purchase_order', $po->id, null, $po->po_reference, (int) $po->material_version, $po->status);
            }
        } elseif ($rm->source_kind === 'da' && $authority->allows('da.read')) {
            $da = Donation::where('chapter_id', $chapterId)->whereKey($rm->source_id)->sharedLock()->first();
            if ($da) {
                $links[] = $this->link('donation', $da->id, null, $da->reference, (int) $da->material_version, $da->status);
            }
        }

        if ($authority->allows('stock.read')) {
            $lots = InventoryLot::where('chapter_id', $chapterId)
                ->where('source_id', $rm->id)
                ->whereIn('source_kind', ['po_rm', 'da_rm'])
                ->orderBy('id')
                ->sharedLock()
                ->get(['id', 'rm_line_id', 'lot_code', 'material_version', 'condition']);
            foreach ($lots as $lot) {
                $links[] = $this->link(
                    'stock_lot',
                    $lot->id,
                    $lot->rm_line_id,
                    is_string($lot->lot_code) && trim($lot->lot_code) !== '' ? mb_substr($lot->lot_code, 0, 80) : null,
                    max(1, (int) ($lot->material_version ?? 1)),
                    ReceivingResource::normalizeCondition($lot->condition),
                );
            }
        }

        $discrepancies = ReceivingDiscrepancy::where('chapter_id', $chapterId)
            ->where(fn ($q) => $q->where('rm_id', $rm->id)->orWhere('replacement_rm_id', $rm->id))
            ->orderBy('id')
            ->sharedLock()
            ->get(['id', 'rm_id', 'rm_line_id', 'material_version', 'status']);
        foreach ($discrepancies as $disc) {
            $links[] = $this->link(
                'receiving_discrepancy',
                $disc->id,
                $disc->rm_id === $rm->id ? $disc->rm_line_id : null,
                null,
                (int) $disc->material_version,
                $disc->status,
            );
        }

        if ($rm->originating_hold_id !== null) {
            $hold = ReceivingHold::where('chapter_id', $chapterId)->whereKey($rm->originating_hold_id)->sharedLock()->first();
            if ($hold) {
                $links[] = $this->link(
                    'receiving_hold',
                    $hold->id,
                    null,
                    $hold->delivery_document_reference,
                    (int) $hold->material_version,
                    $hold->status,
                );
            }
        }

        usort($links, fn (array $a, array $b) => [$a['kind'], $a['id'], $a['rm_line_id'] ?? ''] <=> [$b['kind'], $b['id'], $b['rm_line_id'] ?? '']);

        return self::page($request, $chapterId, "receiving-report-related:{$rmId}", $selectors, $links);
    }

    public function print(Request $request, string $chapterId, string $rmId): Response
    {
        ReceivingInput::selectors($request);
        $rm = $this->find($chapterId, $rmId)->load(ReceivingReportWorkflow::RELATIONS);

        return response()->view('receiving.report', [
            'report' => ReceivingResource::report($rm),
            'location' => $rm->location,
            'lines' => $rm->lines,
            'chapter' => $request->attributes->get('chapter')->name,
        ], 200, [
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function mutate(Request $request, ReceivingReportWorkflow $workflow, string $chapterId, ?string $rmId = null): JsonResponse
    {
        if ($rmId !== null) {
            OpeningDraftInput::requireUuid($rmId, 'receiving report identifier');
        }
        $operation = $request->route()->getName();
        [$key, $input] = ReceivingInput::write($request, $operation);

        return $workflow->mutate($request, $chapterId, $rmId, $operation, $key, $input);
    }

    private function find(string $chapterId, string $rmId): ReceivingReport
    {
        OpeningDraftInput::requireUuid($rmId, 'receiving report identifier');

        return ReceivingReport::where('chapter_id', $chapterId)->whereKey($rmId)->sharedLock()->first()
            ?? throw ReceivingReportWorkflow::notFound();
    }

    private function matchesSearch(ReceivingReport $rm, string $search): bool
    {
        $haystacks = [
            $rm->id,
            $rm->rm_reference,
            $rm->source_reference,
            $rm->supplier_dr_reference,
            $rm->location?->code,
            $rm->location?->name,
        ];
        foreach ($rm->lines as $line) {
            $haystacks[] = $line->discrepancy_notes;
            $haystacks[] = $line->variant?->code ?? $line->variant?->sku;
            $haystacks[] = $line->variant?->name ?? $line->variant?->label;
            $haystacks[] = $line->variant?->item?->code;
            $haystacks[] = $line->variant?->item?->name;
        }
        foreach ($haystacks as $value) {
            if (is_string($value) && $value !== '' && mb_stripos($value, $search) !== false) {
                return true;
            }
        }

        return false;
    }

    private function link(string $kind, string $id, ?string $rmLineId, ?string $reference, int $materialVersion, string $state): array
    {
        return [
            'kind' => $kind,
            'id' => $id,
            'rm_line_id' => $rmLineId,
            'reference' => $reference,
            'material_version' => $materialVersion,
            'state' => $state,
        ];
    }

    private function oneOf(string $value, array $choices): string
    {
        if (! in_array($value, $choices, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid receiving selector.');
        }

        return $value;
    }

    /** @param array<string, string> $selectors */
    public static function parseSearch(array &$selectors): ?string
    {
        if (! isset($selectors['q'])) {
            return null;
        }
        $trimmed = trim($selectors['q'], ' ');
        if ($trimmed === '' || ! preg_match('/\S/u', $trimmed)
            || ! mb_check_encoding($trimmed, 'UTF-8') || mb_strlen($trimmed) > 80
            || preg_match('/[\x00-\x1f\x7f]/', $trimmed)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
        }
        $selectors['q'] = mb_strtolower($trimmed);

        return $trimmed;
    }

    /** @param array<string, string> $selectors */
    public static function page(Request $request, string $chapterId, string $scope, array $selectors, array $items): JsonResponse
    {
        $limit = $selectors['limit'] ?? '25';
        if (! preg_match('/\A(?:[1-9][0-9]?|100)\z/', $limit)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }
        $version = 1 + (int) hexdec(substr(CanonicalJson::sha256($items), 0, 7));
        $filterHash = CanonicalJson::sha256(array_diff_key($selectors, array_flip(['cursor', 'limit'])));

        return SnapshotPage::response($request, $chapterId, $scope, [$filterHash], (int) $limit, $selectors['cursor'] ?? null, $items, $version);
    }
}
