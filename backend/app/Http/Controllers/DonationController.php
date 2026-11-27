<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\DonationInput;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Resources\DonationResource;
use App\Models\Donation;
use App\Models\DonationLine;
use App\Models\Stage2RecordHistory;
use App\Services\Authority\ChapterAuthority;
use App\Services\Donations\DonationWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\SnapshotPage;
use Brick\Math\BigDecimal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class DonationController
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $selectors = DonationInput::selectors($request, ['status', 'q', 'eligible_for', 'limit', 'cursor']);
        $query = Donation::where('chapter_id', $chapterId)->with(DonationWorkflow::RELATIONS);

        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], DonationInput::STATUSES));
        }
        $eligibleFor = isset($selectors['eligible_for'])
            ? $this->oneOf($selectors['eligible_for'], DonationInput::ELIGIBLE_FOR)
            : null;
        $search = null;
        if (isset($selectors['q'])) {
            $trimmed = trim($selectors['q'], ' ');
            if ($trimmed === '' || ! preg_match('/\S/u', $trimmed)
                || ! mb_check_encoding($trimmed, 'UTF-8') || mb_strlen($trimmed) > 80
                || preg_match('/[\x00-\x1f\x7f]/', $trimmed)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
            }
            $selectors['q'] = mb_strtolower($trimmed);
            $search = $trimmed;
        }

        $includeEvidence = $authority->allows('evidence.read');
        $rows = $query->orderByDesc('updated_at')->orderBy('id')->sharedLock()->get();
        if ($eligibleFor === 'receiving') {
            $rows = $rows->filter(fn (Donation $da) => in_array($da->status, ['acknowledged', 'partially_received'], true)
                && $da->lines->contains(fn (DonationLine $line) => BigDecimal::of($line->outstanding_quantity)->isGreaterThan(0)));
        } elseif ($eligibleFor === 'restriction_resolution') {
            $rows = $rows->filter(fn (Donation $da) => in_array($da->status, ['acknowledged', 'partially_received', 'received', 'closed_short'], true)
                && $da->lines->contains(fn (DonationLine $line) => in_array($line->restrictions['state'] ?? null, ['uninterpreted', 'bounded'], true)));
        }
        if ($search !== null) {
            $rows = $rows->filter(fn (Donation $da) => $this->matchesSearch($da, $search));
        }

        $items = $rows->map(fn (Donation $da) => DonationResource::format($da, $includeEvidence))->values()->all();

        return $this->page($request, $chapterId, 'donations', $selectors, $items);
    }

    public function show(Request $request, string $chapterId, string $daId): JsonResponse
    {
        DonationInput::selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $da = $this->find($chapterId, $daId)->load('lines');

        return (new DonationResource($da, $authority->allows('evidence.read')))->response();
    }

    public function history(Request $request, string $chapterId, string $daId): JsonResponse
    {
        $selectors = DonationInput::selectors($request, ['limit', 'cursor']);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $includeEvidence = $authority->allows('evidence.read');
        $da = $this->find($chapterId, $daId);
        $items = DonationWorkflow::history($da)
            ->orderByDesc('version')
            ->orderByDesc('sequence_no')
            ->sharedLock()
            ->get()
            ->map(fn (Stage2RecordHistory $row) => [
                'version' => (int) $row->version,
                'material_version' => (int) $row->material_version,
                'status' => $row->snapshot_json['status'],
                'action' => $row->event_type,
                'actor_id' => $row->actor_user_id,
                'committed_at' => DonationResource::instant($row->recorded_at),
                'reason' => $row->reason,
                'restriction_resolution' => $includeEvidence ? ($row->operation_json['restriction_resolution'] ?? null) : null,
            ])
            ->values()
            ->all();

        return $this->page($request, $chapterId, "donation-history:{$daId}", $selectors, $items);
    }

    public function version(Request $request, string $chapterId, string $daId, string $version): JsonResponse
    {
        DonationInput::selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $targetVersion = OpeningDraftInput::requireRevision($version);
        $da = $this->find($chapterId, $daId);
        $row = DonationWorkflow::history($da)
            ->where('version', $targetVersion)
            ->where('is_version_snapshot', true)
            ->sharedLock()
            ->first() ?? throw DonationWorkflow::notFound();

        $snapshot = $row->snapshot_json;
        if (! $authority->allows('evidence.read')) {
            $snapshot['acknowledgment'] = null;
        }

        return response()->json(['data' => $snapshot]);
    }

    public function related(Request $request, string $chapterId, string $daId): JsonResponse
    {
        $selectors = DonationInput::selectors($request, ['limit', 'cursor']);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $da = $this->find($chapterId, $daId);

        $links = [];
        if ($authority->allows('receiving.read')) {
            foreach (DB::table('receiving_reports')
                ->where('chapter_id', $chapterId)
                ->where('source_kind', 'da')
                ->where('source_id', $da->id)
                ->orderBy('id')
                ->sharedLock()
                ->get(['id']) as $rm) {
                $links[] = ['resource_kind' => 'receiving_report', 'resource_id' => $rm->id, 'da_line_id' => null];
            }
            foreach (DB::table('receiving_discrepancies')
                ->where('chapter_id', $chapterId)
                ->where('source_kind', 'da')
                ->where('source_id', $da->id)
                ->orderBy('id')
                ->sharedLock()
                ->get(['id', 'source_line_id']) as $discrepancy) {
                $links[] = [
                    'resource_kind' => 'receiving_discrepancy',
                    'resource_id' => $discrepancy->id,
                    'da_line_id' => $discrepancy->source_line_id,
                ];
            }
        }
        if ($authority->allows('stock.read')) {
            foreach (DB::table('inventory_lots')
                ->where('chapter_id', $chapterId)
                ->where('source_kind', 'da_rm')
                ->where('origin_source_id', $da->id)
                ->orderBy('id')
                ->sharedLock()
                ->get(['id', 'origin_source_line_id']) as $lot) {
                $links[] = [
                    'resource_kind' => 'stock_lot',
                    'resource_id' => $lot->id,
                    'da_line_id' => $lot->origin_source_line_id,
                ];
            }
        }

        usort($links, fn (array $a, array $b) => [$a['resource_kind'], $a['resource_id'], $a['da_line_id'] ?? '']
            <=> [$b['resource_kind'], $b['resource_id'], $b['da_line_id'] ?? '']);

        return $this->page($request, $chapterId, "donation-related:{$daId}", $selectors, $links);
    }

    public function print(Request $request, string $chapterId, string $daId): Response
    {
        DonationInput::selectors($request);
        $da = $this->find($chapterId, $daId)->load(DonationWorkflow::RELATIONS);

        return response()->view('donations.print', [
            'donation' => DonationResource::format($da, false),
            'lines' => $da->lines,
            'chapter' => $request->attributes->get('chapter')->name,
        ], 200, [
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function find(string $chapterId, string $daId): Donation
    {
        OpeningDraftInput::requireUuid($daId, 'donation identifier');

        return Donation::where('chapter_id', $chapterId)->whereKey($daId)->sharedLock()->first()
            ?? throw DonationWorkflow::notFound();
    }

    private function matchesSearch(Donation $da, string $search): bool
    {
        $haystacks = [$da->id, $da->reference, $da->donor_name];
        foreach ($da->lines as $line) {
            $haystacks[] = $line->valuation_basis;
            $haystacks[] = $line->condition_notes;
            $haystacks[] = $line->restrictions['source_condition_reference'] ?? null;
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

    private function oneOf(string $value, array $choices): string
    {
        if (! in_array($value, $choices, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid donation selector.');
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
}
