<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\InventoryCustody\ChapterInventoryAuthority;
use App\Modules\RequisitionsFulfillment\RequisitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RequisitionController extends Controller
{
    public function __construct(
        private ChapterInventoryAuthority $authority,
        private RequisitionService $service,
        private ChapterOutcomes $outcomes,
    ) {}

    public function index(Request $r, string $chapter_id): JsonResponse
    {
        return $this->read($r, $chapter_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY', 'DISPATCH', 'PURCHASING', 'FINANCE'],
            fn (int $cid, array $a): array => $this->service->snapshot($cid, $a, $r->query()));
    }

    public function formOptions(Request $r, string $chapter_id): JsonResponse
    {
        return $this->read($r, $chapter_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY'],
            fn (int $cid, array $a): array => $this->service->formOptions($cid, $a));
    }

    public function showSummary(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->readWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY', 'DISPATCH', 'PURCHASING', 'FINANCE'],
            fn (int $cid, array $a, int $id): array => $this->service->showSummary($cid, $a, $id));
    }

    public function showHistory(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->readWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY', 'DISPATCH', 'PURCHASING', 'FINANCE'],
            fn (int $cid, array $a, int $id): array => $this->service->showHistory($cid, $a, $id));
    }

    public function allocationProposal(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->readWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'INVENTORY'],
            fn (int $cid, array $a, int $id): array => $this->service->allocationProposal($cid, $a, $id));
    }

    public function createDraft(Request $r, string $chapter_id): JsonResponse
    {
        return $this->mutate($r, $chapter_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER'], false,
            fn (int $cid, array $a, string $k, array $d): array => $this->service->createDraft($cid, $a, $k, $d));
    }

    public function replaceDraft(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->replaceDraft($cid, $a, $id, $k, $d));
    }

    public function discardDraft(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->discardDraft($cid, $a, $id, $k, $d));
    }

    public function submit(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->submit($cid, $a, $id, $k, $d));
    }

    public function review(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'RF_APPROVER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->review($cid, $a, $id, $k, $d));
    }

    public function revise(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->revise($cid, $a, $id, $k, $d));
    }

    public function cancel(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->cancel($cid, $a, $id, $k, $d));
    }

    public function prepareReservation(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'INVENTORY'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->prepareReservation($cid, $a, $id, $k, $d));
    }

    public function commitReservation(Request $r, string $chapter_id, string $rf_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $rf_id, ['CHAPTER_HEAD', 'INVENTORY'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->service->commitReservation($cid, $a, $id, $k, $d));
    }

    public function releaseReservation(Request $r, string $chapter_id, string $rf_id, string $reservation_id): JsonResponse
    {
        if (preg_match('/^[1-9][0-9]{0,18}$/', $rf_id) !== 1 || preg_match('/^[1-9][0-9]{0,18}$/', $reservation_id) !== 1) {
            return response()->json($this->outcomes->blocked(null, 404, 'RESERVATION_NOT_FOUND', 'Requisition or reservation not found.')['body'], 404);
        }

        return $this->mutate($r, $chapter_id, ['CHAPTER_HEAD', 'INVENTORY'], false,
            fn (int $cid, array $a, string $k, array $d): array => $this->service->releaseReservation($cid, $a, (int) $reservation_id, $k, $d, (int) $rf_id));
    }

    public function reallocateReservation(Request $r, string $chapter_id, string $rf_id, string $reservation_id): JsonResponse
    {
        if (preg_match('/^[1-9][0-9]{0,18}$/', $rf_id) !== 1 || preg_match('/^[1-9][0-9]{0,18}$/', $reservation_id) !== 1) {
            return response()->json($this->outcomes->blocked(null, 404, 'RESERVATION_NOT_FOUND', 'Requisition or reservation not found.')['body'], 404);
        }

        return $this->mutate($r, $chapter_id, ['CHAPTER_HEAD', 'INVENTORY'], false,
            fn (int $cid, array $a, string $k, array $d): array => $this->service->reallocateReservation($cid, $a, (int) $reservation_id, $k, $d, (int) $rf_id));
    }

    /** @param list<string> $roles
     * @param  callable(int, array<string, mixed>): array{http_status: int, body: array<string, mixed>}  $fn */
    private function read(Request $r, string $cidRaw, array $roles, callable $fn): JsonResponse
    {
        $auth = $this->authority->authorizeRoles($r, $cidRaw, $roles, false);
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $res = $fn($auth['chapter_id'], $auth['actor']);

        return response()->json($res['body'], $res['http_status']);
    }

    /** @param list<string> $roles
     * @param  callable(int, array<string, mixed>, int): array{http_status: int, body: array<string, mixed>}  $fn */
    private function readWithId(Request $r, string $cidRaw, string $idRaw, array $roles, callable $fn): JsonResponse
    {
        if (preg_match('/^[1-9][0-9]{0,18}$/', $idRaw) !== 1) {
            return response()->json($this->outcomes->blocked(null, 404, 'RF_NOT_FOUND', 'Requisition not found.')['body'], 404);
        }

        return $this->read($r, $cidRaw, $roles, fn (int $cid, array $a): array => $fn($cid, $a, (int) $idRaw));
    }

    /** @param list<string> $roles
     * @param  callable(int, array<string, mixed>, string, array<string, mixed>): array{http_status: int, body: array<string, mixed>}  $fn */
    private function mutate(Request $r, string $cidRaw, array $roles, bool $mfa, callable $fn): JsonResponse
    {
        $auth = $this->authority->authorizeRoles($r, $cidRaw, $roles, $mfa);
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $dec = $this->outcomes->decodeMutation($r, $auth['chapter_id']);
        if ($dec instanceof JsonResponse) {
            return $dec;
        }
        $res = $fn($auth['chapter_id'], $auth['actor'], $dec['key'], $dec['input']);

        return response()->json($res['body'], $res['http_status']);
    }

    /** @param list<string> $roles
     * @param  callable(int, array<string, mixed>, int, string, array<string, mixed>): array{http_status: int, body: array<string, mixed>}  $fn */
    private function mutateWithId(Request $r, string $cidRaw, string $idRaw, array $roles, bool $mfa, callable $fn): JsonResponse
    {
        if (preg_match('/^[1-9][0-9]{0,18}$/', $idRaw) !== 1) {
            return response()->json($this->outcomes->blocked(null, 404, 'RF_NOT_FOUND', 'Requisition not found.')['body'], 404);
        }

        return $this->mutate($r, $cidRaw, $roles, $mfa, fn (int $cid, array $a, string $k, array $d): array => $fn($cid, $a, (int) $idRaw, $k, $d));
    }
}
