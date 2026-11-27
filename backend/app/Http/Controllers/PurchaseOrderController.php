<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\PurchaseOrderInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\RepfResource;
use App\Models\InternalRf;
use App\Models\PurchaseOrder;
use App\Models\Repf;
use App\Models\RepfQuotation;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Procurement\PurchaseOrderWorkflow;
use App\Services\Procurement\RepfWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\SnapshotPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class PurchaseOrderController
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['status', 'repf_id', 'linked_demand_canceled', 'q', 'limit', 'cursor']);
        $query = PurchaseOrder::where('chapter_id', $chapterId)->with(PurchaseOrderWorkflow::RELATIONS);

        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], PurchaseOrderInput::STATUSES));
        }
        if (isset($selectors['repf_id'])) {
            $repfId = OpeningDraftInput::requireUuid($selectors['repf_id'], 'RepF identifier');
            if (! Repf::where('chapter_id', $chapterId)->whereKey($repfId)->exists()) {
                throw RepfWorkflow::notFound();
            }
            $query->where('repf_id', $repfId);
        }
        if (isset($selectors['linked_demand_canceled'])) {
            $canceled = $this->oneOf($selectors['linked_demand_canceled'], ['true', 'false']);
            $query->where('linked_demand_canceled', $canceled === 'true');
        }

        $search = null;
        if (isset($selectors['q'])) {
            $search = mb_strtolower(trim($selectors['q'], ' '), 'UTF-8');
            if ($search === '' || ! preg_match('/\S/u', $search) || ! mb_check_encoding($search, 'UTF-8')
                || mb_strlen($search) > 80 || preg_match('/[\x00-\x1f\x7f]/', $search)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
            }
            $selectors['q'] = $search;
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $models = $query->orderByDesc('updated_at')->orderBy('id')->get();
        if ($search !== null) {
            $models = $models->filter(fn (PurchaseOrder $po) => $po->lines->contains(function ($line) use ($search): bool {
                $variant = $line->variant;
                $itemCode = (string) ($variant?->item?->code ?? '');
                $variantCode = (string) ($variant?->code ?? $variant?->sku ?? '');
                $displayName = (string) ($variant?->name ?? $variant?->label ?? $variant?->item?->name ?? '');

                return str_starts_with(mb_strtolower($itemCode, 'UTF-8'), $search)
                    || str_starts_with(mb_strtolower($variantCode, 'UTF-8'), $search)
                    || str_starts_with(mb_strtolower($displayName, 'UTF-8'), $search);
            }));
        }

        $items = $models->map(fn (PurchaseOrder $po) => PurchaseOrderResource::format($po, $authority))->values()->all();

        return $this->page($request, $chapterId, 'purchase-orders', $selectors, $items);
    }

    public function show(Request $request, string $chapterId, string $poId): JsonResponse
    {
        RepfInput::selectors($request);
        $po = $this->find($chapterId, $poId)->load(PurchaseOrderWorkflow::RELATIONS);
        $authority = $request->attributes->get(ChapterAuthority::class);

        return response()->json(['data' => PurchaseOrderResource::format($po, $authority)]);
    }

    public function history(Request $request, string $chapterId, string $poId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['limit', 'cursor']);
        $po = $this->find($chapterId, $poId);
        $rows = PurchaseOrderWorkflow::history($po)->where('is_version_snapshot', true)
            ->orderByDesc('version')->orderByDesc('sequence_no')->orderByDesc('id')->get();
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
            'po_reference' => $row->snapshot_json['po_reference'],
            'amendment_id' => $row->operation_json['amendment_id'] ?? null,
            'occurred_at' => RepfResource::instant($row->recorded_at),
        ])->all();

        return $this->page($request, $chapterId, "po-history:$poId", $selectors, $items);
    }

    public function version(Request $request, string $chapterId, string $poId, string $version): JsonResponse
    {
        RepfInput::selectors($request);
        $versionNum = OpeningDraftInput::requireRevision($version);
        $po = $this->find($chapterId, $poId);
        $row = PurchaseOrderWorkflow::history($po)->where('version', $versionNum)->where('is_version_snapshot', true)
            ->first() ?? throw RepfWorkflow::notFound();
        $authority = $request->attributes->get(ChapterAuthority::class);

        return response()->json(['data' => PurchaseOrderResource::redactEvidence($row->snapshot_json, $authority)]);
    }

    public function related(Request $request, string $chapterId, string $poId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['limit', 'cursor']);
        $po = $this->find($chapterId, $poId)->load(['repf', 'lines.repfLine']);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $links = [];

        if ($authority->allows('repf.read')) {
            $links[] = $this->link('repf', $po->repf->id, null, $po->repf->repf_reference, (int) $po->repf->material_version, $po->repf->status, (bool) $po->repf->linked_demand_canceled);
        }

        if ($authority->allows('quotation.read')) {
            if ($po->selected_quotation_id && ($quote = RepfQuotation::where('chapter_id', $chapterId)->whereKey($po->selected_quotation_id)->first())) {
                $supplierRef = $quote->supplier['supplier_reference'] ?? null;
                $links[] = $this->link(
                    'quotation', $quote->id, null, is_string($supplierRef) ? mb_substr($supplierRef, 0, 80) : null,
                    (int) $quote->material_version, $quote->is_selected ? 'selected' : 'recorded', false
                );
            }
            $selection = $po->repf->supplier_selection_json['selections'][$po->supplier_selection_id] ?? null;
            if (is_array($selection)) {
                $links[] = $this->link(
                    'supplier_selection', $selection['id'], null, null,
                    (int) ($selection['material_version'] ?? 1), 'selected', false
                );
            }
        }

        if ($authority->allows('rf.read')) {
            $rfIds = $po->lines->map(fn ($line) => $line->repfLine?->rf_id)->filter()->unique()->all();
            $rfs = $rfIds === [] ? collect() : InternalRf::where('chapter_id', $chapterId)->whereIn('id', $rfIds)->get()->keyBy('id');
            foreach ($po->lines as $line) {
                $rf = $line->repfLine?->rf_id ? $rfs->get($line->repfLine->rf_id) : null;
                if ($rf && $authority->canReadRf($rf)) {
                    $links[] = $this->link(
                        'internal_rf', $rf->id, $line->id, $rf->rf_number,
                        (int) ($rf->material_version ?? 1), $rf->status, (bool) $line->linked_demand_canceled
                    );
                }
            }
        }

        if ($authority->allows('receiving.read')) {
            $rms = DB::table('receiving_reports as rr')
                ->leftJoin('receiving_report_lines as rrl', 'rrl.rm_id', '=', 'rr.id')
                ->where('rr.chapter_id', $chapterId)
                ->where('rr.source_kind', 'po')
                ->where('rr.source_id', $po->id)
                ->get(['rr.id', 'rrl.source_line_id', 'rr.rm_reference', 'rr.material_version', 'rr.status']);
            foreach ($rms as $rm) {
                $links[] = $this->link(
                    'receiving_report', $rm->id, $rm->source_line_id, $rm->rm_reference,
                    (int) $rm->material_version, $rm->status, false
                );
            }

            $discrepancies = DB::table('receiving_discrepancies')
                ->where('chapter_id', $chapterId)
                ->where('source_kind', 'po')
                ->where('source_id', $po->id)
                ->get(['id', 'source_line_id', 'material_version', 'status']);
            foreach ($discrepancies as $disc) {
                $links[] = $this->link(
                    'receiving_discrepancy', $disc->id, $disc->source_line_id, null,
                    (int) $disc->material_version, $disc->status, false
                );
            }
        }

        usort($links, fn (array $a, array $b) => [$a['kind'], $a['id'], $a['po_line_id'] ?? ''] <=> [$b['kind'], $b['id'], $b['po_line_id'] ?? '']);

        return $this->page($request, $chapterId, "po-related:$poId", $selectors, $links);
    }

    public function print(Request $request, string $chapterId, string $poId): Response
    {
        RepfInput::selectors($request);
        $po = $this->find($chapterId, $poId)->load(PurchaseOrderWorkflow::RELATIONS);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $formatted = PurchaseOrderResource::format($po, $authority);

        return response()->view('procurement.purchase-order', [
            'po' => $formatted,
            'chapter' => $request->attributes->get('chapter')->name,
        ], 200, [
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function mutate(
        Request $request,
        PurchaseOrderWorkflow $workflow,
        string $chapterId,
        ?string $poId = null,
        ?string $amendmentId = null,
    ): JsonResponse {
        if ($poId !== null) {
            OpeningDraftInput::requireUuid($poId, 'Purchase Order identifier');
        }
        if ($amendmentId !== null) {
            OpeningDraftInput::requireUuid($amendmentId, 'amendment identifier');
        }
        $operation = $request->route()->getName();
        [$key, $input] = PurchaseOrderInput::write($request, $operation);

        return $workflow->mutate($request, $chapterId, $poId, $amendmentId, $operation, $key, $input);
    }

    private function find(string $chapterId, string $poId): PurchaseOrder
    {
        OpeningDraftInput::requireUuid($poId, 'Purchase Order identifier');

        return PurchaseOrder::where('chapter_id', $chapterId)->whereKey($poId)->first() ?? throw RepfWorkflow::notFound();
    }

    private function oneOf(string $value, array $choices): string
    {
        if (! in_array($value, $choices, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid Purchase Order selector.');
        }

        return $value;
    }

    private function page(Request $request, string $chapterId, string $scope, array $selectors, array $items): JsonResponse
    {
        $limit = $selectors['limit'] ?? '25';
        if (! preg_match('/\A(?:[1-9][0-9]?|100)\z/', $limit)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }
        $version = 1 + (int) hexdec(substr(CanonicalJson::sha256($items), 0, 7));
        $filterHash = CanonicalJson::sha256(array_diff_key($selectors, array_flip(['cursor', 'limit'])));

        return SnapshotPage::response($request, $chapterId, $scope, [$filterHash], (int) $limit, $selectors['cursor'] ?? null, $items, $version);
    }

    private function link(string $kind, string $id, ?string $poLineId, ?string $reference, int $materialVersion, string $state, bool $canceled): array
    {
        return [
            'kind' => $kind,
            'id' => $id,
            'po_line_id' => $poLineId,
            'reference' => $reference,
            'material_version' => $materialVersion,
            'state' => $state,
            'linked_demand_canceled' => $canceled,
        ];
    }
}
