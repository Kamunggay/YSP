<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\PurchaseOrderResource;
use App\Models\ActionReceipt;
use App\Services\Authority\ChapterAuthority;
use App\Services\Procurement\PurchaseOrderWorkflow;
use App\Services\Procurement\QuotationWorkflow;
use App\Services\Procurement\RepfWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProcurementOperationController
{
    private const ACTIONS = RepfWorkflow::ACTIONS + QuotationWorkflow::ACTIONS + PurchaseOrderWorkflow::ACTIONS;

    public function byKey(Request $request, string $chapterId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['operation_name', 'action_key']);
        $operation = $selectors['operation_name'] ?? '';
        $key = OpeningDraftInput::requireUuid($selectors['action_key'] ?? '', 'action key');
        if (! isset(self::ACTIONS[$operation])) {
            throw new ContractException(400, 'invalid_selector', 'Invalid procurement operation.');
        }

        return $this->recover($request, $chapterId, ['operation' => $operation, 'key' => $key]);
    }

    public function show(Request $request, string $chapterId, string $id): JsonResponse
    {
        RepfInput::selectors($request);

        return $this->recover($request, $chapterId, ['id' => OpeningDraftInput::requireUuid($id, 'operation identifier')]);
    }

    private function recover(Request $request, string $chapterId, array $selector): JsonResponse
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipt = ActionReceipt::where([
            'chapter_id' => $chapterId, 'user_id' => $request->user()->id, 'evidence_scope' => '',
        ] + $selector)->whereIn('operation', array_keys(self::ACTIONS))->first();

        if ($receipt === null || ! $authority->allows(self::ACTIONS[$receipt->operation])
            || ($receipt->operation === 'cancelRepf' && ($receipt->result['data']['result']['approved_budget_php'] ?? null) !== null
                && ! $authority->allows('repf.budget_review'))
            || ($receipt->operation === 'cancelPurchaseOrder' && ($receipt->result['data']['result']['po_reference'] ?? null) !== null
                && ! $authority->allows('po.approve'))) {
            throw new ContractException(404, 'operation_not_found', 'Operation not found.');
        }

        $body = $receipt->result;
        if (! $authority->allows('evidence.read')) {
            $kind = $body['data']['resource_kind'] ?? null;
            if ($kind === 'quotation' && isset($body['data']['result']['evidence_binding'])) {
                $body['data']['result']['evidence_binding'] = null;
            } elseif ($kind === 'purchase_order' && isset($body['data']['result'])) {
                $body['data']['result'] = PurchaseOrderResource::redactEvidence($body['data']['result'], $authority);
            } elseif ($kind === 'purchase_order_amendment' && isset($body['data']['result']['purchase_order'])) {
                $body['data']['result']['purchase_order'] = PurchaseOrderResource::redactEvidence($body['data']['result']['purchase_order'], $authority);
            }
        }

        return response()->json($body);
    }
}
