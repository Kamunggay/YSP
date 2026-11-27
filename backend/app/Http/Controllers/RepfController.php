<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\RepfResource;
use App\Models\InternalRf;
use App\Models\Repf;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Procurement\RepfWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\SnapshotPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class RepfController
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['status', 'trigger_kind', 'rf_id', 'linked_demand_canceled', 'q', 'limit', 'cursor']);
        $query = Repf::where('chapter_id', $chapterId)->with(RepfWorkflow::RELATIONS);
        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], RepfInput::STATUSES));
        }
        if (isset($selectors['trigger_kind'])) {
            $kind = $this->oneOf($selectors['trigger_kind'], RepfInput::TRIGGERS);
            $query->whereHas('lines', fn ($lines) => $lines->where('trigger_kind', $kind));
        }
        if (isset($selectors['rf_id'])) {
            $rf = OpeningDraftInput::requireUuid($selectors['rf_id'], 'RF identifier');
            if (! InternalRf::where('chapter_id', $chapterId)->whereKey($rf)->exists()) {
                throw RepfWorkflow::notFound();
            }
            $query->whereHas('lines', fn ($lines) => $lines->where('rf_id', $rf));
        }
        if (isset($selectors['linked_demand_canceled'])) {
            $canceled = $this->oneOf($selectors['linked_demand_canceled'], ['true', 'false']);
            $query->where('linked_demand_canceled', $canceled === 'true');
        }

        if (isset($selectors['q'])) {
            $selectors['q'] = strtolower(trim($selectors['q'], ' '));
            $search = $selectors['q'];
            if ($search === '' || ! mb_check_encoding($search, 'UTF-8') || mb_strlen($search) > 80 || preg_match('/[\x00-\x1f\x7f]/', $search)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
            }
        }

        $items = $query->orderByDesc('updated_at')->orderByDesc('id')->get()
            ->map(fn (Repf $repf) => (new RepfResource($repf))->resolve($request));
        if (isset($search)) {
            $items = $items->filter(fn (array $repf) => collect($repf['lines'])->contains(fn (array $line) => str_starts_with(strtolower($line['item_code']), $search)
                || str_starts_with(strtolower($line['variant_code']), $search)
                || str_starts_with(strtolower($line['display_name']), $search)));
        }

        return $this->page($request, $chapterId, 'repfs', $selectors, $items->values()->all());
    }

    public function show(Request $request, string $chapterId, string $id): JsonResponse
    {
        RepfInput::selectors($request);
        $repf = $this->find($chapterId, $id)->load(RepfWorkflow::RELATIONS);

        return (new RepfResource($repf))->response();
    }

    public function history(Request $request, string $chapterId, string $id): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['limit', 'cursor']);
        $repf = $this->find($chapterId, $id);
        $history = RepfWorkflow::history($repf)->where('is_version_snapshot', true)->orderBy('version')->orderBy('id')->get();
        $actors = User::whereIn('id', $history->pluck('actor_user_id')->unique())->get()->keyBy('id');
        $items = $history->map(fn (Stage2RecordHistory $row) => [
            'id' => $row->id,
            'version' => (int) $row->version,
            'material_version' => (int) $row->material_version,
            'action' => $row->event_type,
            'from_status' => $row->operation_json['from_status'] ?? null,
            'to_status' => $row->snapshot_json['status'],
            'actor' => $row->operation_json['actor'] ?? RepfResource::actor($actors->get($row->actor_user_id)),
            'reason' => $row->reason,
            'repf_reference' => $row->snapshot_json['repf_reference'],
            'occurred_at' => RepfResource::instant($row->recorded_at),
        ]);

        return $this->page($request, $chapterId, "repf-history:$id", $selectors, $items->all());
    }

    public function version(Request $request, string $chapterId, string $id, string $version): JsonResponse
    {
        RepfInput::selectors($request);
        $version = OpeningDraftInput::requireRevision($version);
        $repf = $this->find($chapterId, $id);
        $row = RepfWorkflow::history($repf)->where('version', $version)->where('is_version_snapshot', true)
            ->first() ?? throw RepfWorkflow::notFound();

        return response()->json(['data' => $row->snapshot_json]);
    }

    public function related(Request $request, string $chapterId, string $id): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['limit', 'cursor']);
        $repf = $this->find($chapterId, $id)->load('lines');
        $rfs = InternalRf::where('chapter_id', $chapterId)->whereIn('id', $repf->lines->pluck('rf_id')->filter())
            ->get()->keyBy('id');
        $links = [];
        foreach ($repf->lines as $line) {
            if ($rf = $rfs->get($line->rf_id)) {
                $links[] = $this->link('internal_rf', $rf->id, $rf->rf_number, $rf->material_version,
                    $rf->status, $line->linked_demand_canceled, $line->id);
            }
        }
        $coordinate = ['chapter_id' => $chapterId, 'repf_id' => $id];
        foreach (DB::table('repf_quotations')->where($coordinate)->orderBy('id')->get() as $quote) {
            $links[] = $this->link('quotation', $quote->id, null, $quote->material_version,
                $quote->is_selected ? 'selected' : 'recorded', false);
        }
        foreach (DB::table('purchase_orders')->where($coordinate)->orderBy('id')->get() as $po) {
            $links[] = $this->link('purchase_order', $po->id, $po->po_reference, $po->material_version,
                $po->status, (bool) $po->linked_demand_canceled);
        }

        return $this->page($request, $chapterId, "repf-related:$id", $selectors, $links);
    }

    public function print(Request $request, string $chapterId, string $id): Response
    {
        RepfInput::selectors($request);
        $repf = $this->find($chapterId, $id)->load(RepfWorkflow::RELATIONS);

        return response()->view('procurement.repf', [
            'repf' => (new RepfResource($repf))->resolve($request),
            'chapter' => $request->attributes->get('chapter')->name,
        ], 200, [
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function find(string $chapterId, string $id): Repf
    {
        OpeningDraftInput::requireUuid($id, 'RepF identifier');

        return Repf::where('chapter_id', $chapterId)->whereKey($id)->first() ?? throw RepfWorkflow::notFound();
    }

    private function oneOf(string $value, array $choices): string
    {
        if (! in_array($value, $choices, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid RepF selector.');
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

    private function link(string $kind, string $id, ?string $reference, int $materialVersion, string $state, bool $canceled, ?string $lineId = null): array
    {
        return [
            'kind' => $kind, 'id' => $id, 'repf_line_id' => $lineId, 'reference' => $reference,
            'material_version' => $materialVersion, 'state' => $state, 'linked_demand_canceled' => $canceled,
        ];
    }
}
