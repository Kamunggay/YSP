<?php

namespace App\Http\Controllers;

use App\Http\Requests\DonationInput;
use App\Http\Requests\OpeningDraftInput;
use App\Services\Donations\DonationWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DonationMutationController
{
    public function __invoke(Request $request, DonationWorkflow $workflow, string $chapterId, ?string $daId = null): JsonResponse
    {
        if ($daId !== null) {
            OpeningDraftInput::requireUuid($daId, 'donation identifier');
        }
        $operation = $request->route()->getName();
        [$key, $input] = DonationInput::write($request, $operation);

        return $workflow->mutate($request, $chapterId, $daId, $operation, $key, $input);
    }
}
