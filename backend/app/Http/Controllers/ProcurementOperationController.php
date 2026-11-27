<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Models\ActionReceipt;
use App\Services\Authority\ChapterAuthority;
use App\Services\Procurement\RepfWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProcurementOperationController
{
    private const OPERATIONS = [
        'createRepfQuotation', 'replaceRepfQuotation', 'deleteRepfQuotation', 'recordSupplierSelection',
        'createPurchaseOrder', 'replacePurchaseOrder', 'submitPurchaseOrder', 'approvePurchaseOrder',
        'returnPurchaseOrder', 'rejectPurchaseOrder', 'recordPurchaseOrderAcknowledgment',
        'proposePurchaseOrderAmendment', 'approvePurchaseOrderAmendment', 'closeShortPurchaseOrder', 'cancelPurchaseOrder',
    ];

    public function byKey(Request $request, string $chapterId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['operation_name', 'action_key']);
        $operation = $selectors['operation_name'] ?? '';
        $key = OpeningDraftInput::requireUuid($selectors['action_key'] ?? '', 'action key');
        if (! in_array($operation, [...array_keys(RepfWorkflow::ACTIONS), ...self::OPERATIONS], true)) {
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
        ] + $selector)->whereIn('operation', array_keys(RepfWorkflow::ACTIONS))->first();

        if ($receipt === null || ! $authority->allows(RepfWorkflow::ACTIONS[$receipt->operation])
            || ($receipt->operation === 'cancelRepf' && $receipt->result['data']['result']['approved_budget_php'] !== null
                && ! $authority->allows('repf.budget_review'))) {
            throw new ContractException(404, 'operation_not_found', 'Operation not found.');
        }

        return response()->json($receipt->result);
    }
}
