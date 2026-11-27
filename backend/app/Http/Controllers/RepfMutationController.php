<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Services\Procurement\RepfWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RepfMutationController
{
    public function __invoke(Request $request, RepfWorkflow $workflow, string $chapterId, ?string $id = null): JsonResponse
    {
        if ($id !== null) {
            OpeningDraftInput::requireUuid($id, 'RepF identifier');
        }
        $operation = $request->route()->getName();
        try {
            [$key, $input] = RepfInput::write($request, $operation);
        } catch (ContractException $exception) {
            if ($exception->errorCode === 'malformed_request') {
                throw new ContractException(400, 'invalid_selector', $exception->getMessage());
            }
            throw $exception;
        }

        return $workflow->mutate($request, $chapterId, $id, $operation, $key, $input);
    }
}
