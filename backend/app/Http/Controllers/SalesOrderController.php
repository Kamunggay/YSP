<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\InventoryCustody\ChapterInventoryAuthority;
use App\Modules\SalesFinance\SalesOrderService;
use App\Modules\SalesFinance\TwoClocksService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class SalesOrderController extends Controller
{
    public function __construct(
        private ChapterInventoryAuthority $authority,
        private SalesOrderService $sales,
        private TwoClocksService $clocks,
        private ChapterOutcomes $outcomes,
    ) {}

    public function index(Request $r, string $chapter_id): JsonResponse
    {
        return $this->read($r, $chapter_id, ['CHAPTER_HEAD', 'SALES_OFFICER', 'SALES_REVIEWER', 'FINANCE', 'INVENTORY', 'PURCHASING'],
            fn (int $cid): array => $this->sales->snapshot($cid, $r->query()));
    }

    public function configurePool(Request $r, string $chapter_id): JsonResponse
    {
        return $this->mutate($r, $chapter_id, ['CHAPTER_HEAD', 'FINANCE', 'SALES_REVIEWER'], false,
            fn (int $cid, array $a, string $k, array $d): array => $this->sales->configurePool($cid, $a, $k, $d));
    }

    public function createDraft(Request $r, string $chapter_id): JsonResponse
    {
        return $this->mutate($r, $chapter_id, ['CHAPTER_HEAD', 'SALES_OFFICER'], false,
            fn (int $cid, array $a, string $k, array $d): array => $this->sales->createDraft($cid, $a, $k, $d));
    }

    public function submit(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->submit($cid, $a, $id, $k, $d));
    }

    public function approve(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_REVIEWER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->approve($cid, $a, $id, $k, $d));
    }

    public function returnOrder(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_REVIEWER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->returnOrder($cid, $a, $id, $k, $d));
    }

    public function revise(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->revise($cid, $a, $id, $k, $d));
    }

    public function cancel(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER', 'SALES_REVIEWER'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->cancel($cid, $a, $id, $k, $d));
    }

    public function split(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER', 'SALES_REVIEWER', 'INVENTORY'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->split($cid, $a, $id, $k, $d));
    }

    public function buyerAcceptance(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->buyerAcceptance($cid, $a, $id, $k, $d));
    }

    public function issueInvoice(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER', 'FINANCE'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->sales->issueInvoice($cid, $a, $id, $k, $d));
    }

    public function approveExcessCost(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'FINANCE'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->clocks->approveExcessCost($cid, $a, $id, $k, $d));
    }

    public function recordFunding(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'FINANCE'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->clocks->recordFunding($cid, $a, $id, $k, $d));
    }

    public function evaluateClocks(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'FINANCE', 'SALES_OFFICER', 'SALES_REVIEWER'], false,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->clocks->evaluateClocks($cid, $a, $id, $k, $d));
    }

    public function forwardRepf(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'SALES_OFFICER', 'FINANCE', 'PURCHASING'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->clocks->forwardRepf($cid, $a, $id, $k, $d));
    }

    public function resolveLatePayment(Request $r, string $chapter_id, string $so_id): JsonResponse
    {
        return $this->mutateWithId($r, $chapter_id, $so_id, ['CHAPTER_HEAD', 'FINANCE'], true,
            fn (int $cid, array $a, int $id, string $k, array $d): array => $this->clocks->resolveLatePayment($cid, $a, $id, $k, $d));
    }

    /** @param list<string> $roles
     * @param  callable(int): array{http_status: int, body: array<string, mixed>}  $fn */
    private function read(Request $r, string $cidRaw, array $roles, callable $fn): JsonResponse
    {
        $auth = $this->authority->authorizeRoles($r, $cidRaw, $roles, false);
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $res = $fn($auth['chapter_id']);

        return response()->json($res['body'], $res['http_status']);
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
            return response()->json($this->outcomes->blocked(null, 404, 'SO_NOT_FOUND', 'Sales order not found.')['body'], 404);
        }

        return $this->mutate($r, $cidRaw, $roles, $mfa, fn (int $cid, array $a, string $k, array $d): array => $fn($cid, $a, (int) $idRaw, $k, $d));
    }
}
