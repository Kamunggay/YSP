<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\DocumentsReporting\OperationsMapService;
use App\Modules\DocumentsReporting\ReportsAndQueuesService;
use App\Modules\InventoryCustody\ChapterInventoryAuthority;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Chapter-scoped HTTP boundary for canonical operation lookups, Phase 4 (P24) Reports/Queues, and (P25) Operations Map.
 */
final class ReportsAndMapController extends Controller
{
    public function __construct(
        private ChapterInventoryAuthority $auth,
        private ReportsAndQueuesService $reports,
        private OperationsMapService $map,
        private ChapterOutcomes $outcomes,
    ) {}

    public function stockViews(Request $r, string $chapter_id): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapter_id), fn (array $a): array => ['http_status' => 200, 'body' => $this->reports->sevenStockViews($a['chapter_id'])]);
    }

    public function workspace(Request $r, string $chapter_id): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapter_id), fn (array $a): array => $this->reports->workspace($a['chapter_id'], $a['actor'], (array) $r->query()));
    }

    public function enqueueAlert(Request $r, string $chapter_id): JsonResponse
    {
        return $this->jsonRun($r, $this->auth->authorizeRoles($r, $chapter_id, ChapterInventoryAuthority::READ_ROLES),
            fn (array $a, array $in, string $k): array => $this->reports->enqueueAlert($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function generateReport(Request $r, string $chapter_id): JsonResponse
    {
        return $this->jsonRun($r, $this->auth->authorizeRoles($r, $chapter_id, ChapterInventoryAuthority::READ_ROLES),
            fn (array $a, array $in, string $k): array => $this->reports->generateReport($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function retryReport(Request $r, string $chapter_id, string $job_id): JsonResponse
    {
        $auth = $this->auth->authorizeRoles($r, $chapter_id, ChapterInventoryAuthority::READ_ROLES);
        if (! $auth['ok']) {
            return $auth['response'];
        }
        if (preg_match('/^[1-9][0-9]{0,18}$/', $job_id) !== 1) {
            return response()->json($this->outcomes->blocked($auth['chapter_id'], 404, 'JOB_NOT_FOUND', 'Report job not found.')['body'], 404);
        }

        return $this->jsonRun($r, $auth,
            fn (array $a, array $in, string $k): array => $this->reports->retryReport($a['chapter_id'], $a['actor'], (int) $job_id, $k, $in));
    }

    public function getMap(Request $r, string $chapter_id): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapter_id), fn (array $a): array => ['http_status' => 200, 'body' => $this->map->getMap($a['chapter_id'], $a['actor'])]);
    }

    public function selectView(Request $r, string $chapter_id): JsonResponse
    {
        return $this->jsonRun($r, $this->auth->authorizeRead($r, $chapter_id),
            fn (array $a, array $in, string $k): array => $this->map->selectViewAndScenario($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function toggleTextAlternative(Request $r, string $chapter_id): JsonResponse
    {
        return $this->jsonRun($r, $this->auth->authorizeRead($r, $chapter_id),
            fn (array $a, array $in, string $k): array => $this->map->toggleTextAlternative($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function setFailureMode(Request $r, string $chapter_id): JsonResponse
    {
        return $this->jsonRun($r, $this->auth->authorizeRoles($r, $chapter_id, ['CHAPTER_HEAD', 'INDEPENDENT_REVIEWER', 'INVENTORY']),
            fn (array $a, array $in, string $k): array => $this->map->setFailureMode($a['chapter_id'], $a['actor'], $k, $in));
    }

    public function renderDiagram(Request $r, string $chapter_id): JsonResponse
    {
        return $this->run($this->auth->authorizeRead($r, $chapter_id), fn (array $a): array => $this->map->renderDiagram($a['chapter_id'], $a['actor']));
    }

    public function inspectNode(Request $r, string $chapter_id, string $node_code): JsonResponse
    {
        $auth = $this->auth->authorizeRead($r, $chapter_id);
        if (! $auth['ok']) {
            if ($auth['response']->getStatusCode() === 403) {
                $err = $this->outcomes->forbidden('NEUTRAL_SCOPE_RESTRICTED_EXPLANATION', 'This operational checkpoint is restricted to authorized chapter duties.');

                return response()->json($err['body'], $err['http_status']);
            }

            return $auth['response'];
        }

        return $this->run($auth, fn (array $a): array => $this->map->inspectNode($a['chapter_id'], $a['actor'], $node_code));
    }

    /** @param array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} $auth
     * @param  callable(array{chapter_id: int, actor: array<string, mixed>}): array{http_status: int, body: array<string, mixed>}  $fn */
    private function run(array $auth, callable $fn): JsonResponse
    {
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $res = $fn(['chapter_id' => $auth['chapter_id'], 'actor' => $auth['actor']]);

        return response()->json($res['body'], $res['http_status']);
    }

    /** @param array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} $auth
     * @param  callable(array{chapter_id: int, actor: array<string, mixed>}, array<string, mixed>, string): array{http_status: int, body: array<string, mixed>}  $fn */
    private function jsonRun(Request $r, array $auth, callable $fn): JsonResponse
    {
        if (! $auth['ok']) {
            return $auth['response'];
        }
        $dec = $this->outcomes->decodeMutation($r, $auth['chapter_id']);

        return $dec instanceof JsonResponse
            ? $dec
            : $this->run($auth, fn (array $a): array => $fn($a, $dec['input'], $dec['key']));
    }
}
