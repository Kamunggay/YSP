<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\DonationInput;
use App\Http\Requests\OpeningDraftInput;
use App\Models\ActionReceipt;
use App\Services\Authority\ChapterAuthority;
use App\Services\Donations\DonationWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DonationOperationController
{
    public function byKey(Request $request, string $chapterId): JsonResponse
    {
        $selectors = DonationInput::selectors($request, ['operation_name', 'action_key']);
        $operation = $selectors['operation_name'] ?? '';
        $key = OpeningDraftInput::requireUuid($selectors['action_key'] ?? '', 'action key');
        if (! array_key_exists($operation, DonationWorkflow::ACTIONS)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid donation operation.');
        }

        return $this->recover($request, $chapterId, ['operation' => $operation, 'key' => $key]);
    }

    public function show(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        DonationInput::selectors($request);

        return $this->recover($request, $chapterId, ['id' => OpeningDraftInput::requireUuid($operationId, 'operation identifier')]);
    }

    private function recover(Request $request, string $chapterId, array $selector): JsonResponse
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipt = ActionReceipt::where([
            'chapter_id' => $chapterId,
            'user_id' => $request->user()->id,
            'evidence_scope' => '',
        ] + $selector)->whereIn('operation', array_keys(DonationWorkflow::ACTIONS))->sharedLock()->first();

        if ($receipt === null) {
            throw new ContractException(404, 'operation_not_found', 'Operation not found.');
        }

        $operation = $receipt->operation;
        $authority->requireAction(DonationWorkflow::ACTIONS[$operation]);
        if (isset(DonationWorkflow::POLICY_DUTY_FIELDS[$operation])) {
            $preparedBy = (string) ($receipt->result['data']['result']['prepared_by'] ?? '');
            DonationWorkflow::authorizePolicyAction($authority, $operation, $preparedBy);
        }

        return response()->json($receipt->result);
    }
}
