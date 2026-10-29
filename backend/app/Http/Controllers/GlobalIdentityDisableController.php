<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\AccessChapterAdministration\GlobalIdentityDisable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class GlobalIdentityDisableController
{
    public function __construct(private GlobalIdentityDisable $operation) {}

    public function disable(Request $request): JsonResponse
    {
        return $this->operation->disable($request);
    }

    public function lookupByKey(Request $request): JsonResponse
    {
        return $this->operation->lookupByKey($request);
    }

    public function lookupById(Request $request, string $operationId): JsonResponse
    {
        return $this->operation->lookupById($request, $operationId);
    }
}
