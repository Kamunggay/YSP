<?php

namespace App\Http\Controllers;

use App\Services\Inventory\OpeningDraftService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class OpeningInventoryController extends Controller
{
    public function __construct(
        private readonly OpeningDraftService $drafts,
    ) {}

    public function listIpcs(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->listIpcs($request, $chapterId);
    }

    public function createIpc(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->createIpc($request, $chapterId);
    }

    public function readIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->readIpc($request, $chapterId, $ipcId);
    }

    public function saveMyIpcCount(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->saveMyIpcCount($request, $chapterId, $ipcId);
    }

    public function submitIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->submitIpc($request, $chapterId, $ipcId);
    }

    public function authorizeIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->authorizeIpc($request, $chapterId, $ipcId);
    }

    public function replaceIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->replaceIpc($request, $chapterId, $ipcId);
    }

    public function listIpcHistory(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->listIpcHistory($request, $chapterId, $ipcId);
    }

    public function readIpcRevision(Request $request, string $chapterId, string $ipcId, string $revision): JsonResponse
    {
        return $this->drafts->readIpcRevision($request, $chapterId, $ipcId, $revision);
    }

    public function readIpcRelated(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->readIpcRelated($request, $chapterId, $ipcId);
    }

    public function printIpc(Request $request, string $chapterId, string $ipcId): Response
    {
        return $this->drafts->printIpc($request, $chapterId, $ipcId);
    }

    public function listOpeningRms(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->listOpeningRms($request, $chapterId);
    }

    public function createOpeningRm(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->createOpeningRm($request, $chapterId);
    }

    public function readOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->readOpeningRm($request, $chapterId, $rmId);
    }

    public function replaceOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->replaceOpeningRm($request, $chapterId, $rmId);
    }

    public function inspectOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->inspectOpeningRm($request, $chapterId, $rmId);
    }

    public function matchOpeningRmEvidence(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->matchOpeningRmEvidence($request, $chapterId, $rmId);
    }

    public function postOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->postOpeningRm($request, $chapterId, $rmId);
    }

    public function readChapterOpeningBaseline(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->readChapterOpeningBaseline($request, $chapterId);
    }

    public function listOpeningRmMovements(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->listOpeningRmMovements($request, $chapterId, $rmId);
    }

    public function listOpeningRmFindings(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->listOpeningRmFindings($request, $chapterId, $rmId);
    }

    public function listOpeningRmHistory(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->listOpeningRmHistory($request, $chapterId, $rmId);
    }

    public function readOpeningRmRevision(Request $request, string $chapterId, string $rmId, string $revision): JsonResponse
    {
        return $this->drafts->readOpeningRmRevision($request, $chapterId, $rmId, $revision);
    }

    public function readOpeningRmRelated(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->readOpeningRmRelated($request, $chapterId, $rmId);
    }

    public function printOpeningRm(Request $request, string $chapterId, string $rmId): Response
    {
        return $this->drafts->printOpeningRm($request, $chapterId, $rmId);
    }

    public function findOpeningActionByKey(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->findOpeningActionByKey($request, $chapterId);
    }

    public function readOpeningAction(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        return $this->drafts->readOpeningAction($request, $chapterId, $operationId);
    }
}
