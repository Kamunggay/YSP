<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\ReceivingInput;
use App\Http\Resources\ReceivingResource;
use App\Models\ActionReceipt;
use App\Services\Authority\ChapterAuthority;
use App\Services\Receiving\ReceivingExceptionWorkflow;
use App\Services\Receiving\ReceivingReportWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceivingOperationController
{
    public const ACTIONS = ReceivingReportWorkflow::ACTIONS
        + ReceivingExceptionWorkflow::DISCREPANCY_ACTIONS
        + ReceivingExceptionWorkflow::HOLD_ACTIONS;

    public function byKey(Request $request, string $chapterId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['operation_name', 'action_key']);
        $operation = $selectors['operation_name'] ?? '';
        $key = OpeningDraftInput::requireUuid($selectors['action_key'] ?? '', 'action key');
        if (! isset(self::ACTIONS[$operation])) {
            throw new ContractException(400, 'invalid_selector', 'Invalid receiving operation.');
        }

        return $this->recover($request, $chapterId, ['operation' => $operation, 'key' => $key]);
    }

    public function show(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        ReceivingInput::selectors($request);

        return $this->recover($request, $chapterId, ['id' => OpeningDraftInput::requireUuid($operationId, 'operation identifier')]);
    }

    private function recover(Request $request, string $chapterId, array $selector): JsonResponse
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipt = ActionReceipt::where([
            'chapter_id' => $chapterId,
            'user_id' => $request->user()->id,
            'evidence_scope' => '',
        ] + $selector)->whereIn('operation', array_keys(self::ACTIONS))->sharedLock()->first();

        if ($receipt === null || ! $authority->allows(self::ACTIONS[$receipt->operation])) {
            throw new ContractException(404, 'operation_not_found', 'Operation not found.');
        }

        $body = $receipt->result;
        if (($body['data']['resource_kind'] ?? null) === 'receiving_hold' && isset($body['data']['result'])) {
            $body['data']['result'] = ReceivingResource::redactHoldEvidence($body['data']['result'], $authority);
        }

        return response()->json($body);
    }
}
