<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\QuotationInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\QuotationResource;
use App\Models\Repf;
use App\Models\RepfQuotation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Procurement\QuotationWorkflow;
use App\Services\Procurement\RepfWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\SnapshotPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuotationController
{
    public function index(Request $request, string $chapterId, string $repfId): JsonResponse
    {
        OpeningDraftInput::requireUuid($repfId, 'RepF identifier');
        $selectors = RepfInput::selectors($request, ['limit', 'cursor', 'q', 'eligible_for']);
        $limit = $selectors['limit'] ?? '25';
        if (! preg_match('/\A(?:[1-9][0-9]?|100)\z/', $limit)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }

        $eligibleFor = $selectors['eligible_for'] ?? null;
        if ($eligibleFor !== null && ! in_array($eligibleFor, ['supplier_selection', 'purchase_order'], true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid eligible_for selector.');
        }

        $search = null;
        if (isset($selectors['q'])) {
            $search = trim($selectors['q'], ' ');
            if ($search === '' || ! preg_match('/\S/u', $search) || ! mb_check_encoding($search, 'UTF-8')
                || mb_strlen($search) > 80 || preg_match('/[\x00-\x1f\x7f]/', $search)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
            }
            $selectors['q'] = $search;
        }

        $repf = Repf::where('chapter_id', $chapterId)->whereKey($repfId)->sharedLock()->first()
            ?? throw RepfWorkflow::notFound();
        $authority = $request->attributes->get(ChapterAuthority::class);
        $repfEligible = in_array($repf->status, ['approved', 'partially_ordered'], true);

        $query = RepfQuotation::where('chapter_id', $chapterId)->where('repf_id', $repf->id)->with('recorder');
        if ($eligibleFor !== null && ! $repfEligible) {
            $quotes = collect();
        } else {
            if ($eligibleFor === 'purchase_order') {
                $query->where('is_selected', true);
            }
            $quotes = $query->orderByDesc('is_selected')->orderBy('total_amount_php')->orderBy('created_at')->orderBy('id')->get();
        }

        $items = $quotes->map(fn (RepfQuotation $quote) => QuotationResource::format($quote, $authority));
        if ($search !== null) {
            $items = $items->filter(function (array $quote) use ($search): bool {
                $haystacks = [
                    $quote['supplier']['supplier_name'] ?? null,
                    $quote['supplier']['supplier_subtype'] ?? null,
                    $quote['supplier']['contact_reference'] ?? null,
                    $quote['supplier']['supplier_reference'] ?? null,
                    $quote['availability_summary'] ?? null,
                    $quote['quality_warranty_terms'] ?? null,
                    $quote['payment_and_delivery_terms'] ?? null,
                    $quote['reliability_notes'] ?? null,
                    ...array_column($quote['lines'], 'notes'),
                ];
                foreach ($haystacks as $value) {
                    if (is_string($value) && $value !== '' && mb_stripos($value, $search) !== false) {
                        return true;
                    }
                }

                return false;
            });
        }

        $list = $items->values()->all();
        $version = 1 + (int) hexdec(substr(CanonicalJson::sha256($list), 0, 7));
        $filterHash = CanonicalJson::sha256(array_diff_key($selectors, array_flip(['cursor', 'limit'])));

        return SnapshotPage::response($request, $chapterId, "repf-quotations:$repfId", [$filterHash], (int) $limit, $selectors['cursor'] ?? null, $list, $version);
    }

    public function mutate(Request $request, QuotationWorkflow $workflow, string $chapterId, string $repfId, ?string $quotationId = null): JsonResponse
    {
        OpeningDraftInput::requireUuid($repfId, 'RepF identifier');
        if ($quotationId !== null) {
            OpeningDraftInput::requireUuid($quotationId, 'quotation identifier');
        }
        $operation = $request->route()->getName();
        [$key, $input] = QuotationInput::write($request, $operation);

        return $workflow->mutate($request, $chapterId, $repfId, $quotationId, $operation, $key, $input);
    }
}
