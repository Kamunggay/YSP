<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\OpeningRm;
use App\Models\StockHold;
use App\Services\Authority\ChapterAuthority;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceStageOneAction
{
    public function handle(Request $request, Closure $next, string ...$actions): Response
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        foreach ($actions as $action) {
            if (! array_intersect($authority->duties(), ChapterAuthority::ACTION_DUTIES[$action])) {
                throw new ContractException(403, 'duty_denied', 'Current duty does not permit this action.');
            }
        }

        if (! $request->isMethodSafe()) {
            $authority->lockPoliciesFor($actions);
        }

        if ($request->is('*/evidence', '*/evidence/*')) {
            $this->authorizeEvidenceTarget($request, $authority);

            return $this->response($request, $next);
        }

        $rfId = $request->route('rf_id');
        if ($issueId = $request->route('issue_id')) {
            $rfId = ActualIssue::where('chapter_id', $authority->chapter->id)->whereKey($issueId)
                ->value('requisition_id');
            if (! $rfId) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }
        }

        $rf = null;
        if ($rfId) {
            $query = InternalRf::where('chapter_id', $authority->chapter->id)->whereKey($rfId);
            $rf = ($request->isMethodSafe() ? $query->sharedLock() : $query->lockForUpdate())->first();
            if (! $rf) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }
            if (in_array('rf.read', $actions, true) && ! $authority->canReadRf($rf)) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }
            if ($rf->requester_user_id !== $request->user()->id
                && array_intersect($actions, ['rf.draft', 'rf.submit'])) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }
        }

        $rfList = $request->route()->getActionMethod() === 'listInternalRfs';
        $receipt = $request->isMethod('GET') && $request->is('*/internal-rfs/operation-results', '*/internal-rfs/operation-results/*', '*/actual-issue-operations/*', '*/reservation-operations/*');
        if (! $rfList && ! $receipt) {
            foreach ($actions as $action) {
                if ($action === 'ipc.authorize' || ($action === 'rf.draft' && ! $rf) || ($action === 'rf.read' && $rf)) {
                    continue;
                }
                if ($action === 'rf.approve' && $rf && $authority->routedRfApprover($rf)) {
                    continue;
                }
                $unit = $rf?->requesting_unit_id;
                if (! $authority->allows($action, $unit)) {
                    $decision = $action === 'history.read' && $rf ? $authority->rfDecisionScope($rf) : null;
                    $authority->requireAction($action, $unit, $decision);
                }
            }
        }

        if (in_array('rf.draft', $actions, true)) {
            $unit = $request->input('requesting_unit_id', $rf?->requesting_unit_id);
            if (is_string($unit) || $unit === null) {
                if (! $rf || $unit !== $rf->requesting_unit_id) {
                    $authority->requireAction('rf.draft', $unit);
                }
            } else {
                throw new ContractException(422, 'invalid_input', 'Invalid requesting unit.');
            }
        }

        return $this->response($request, $next);
    }

    private function authorizeEvidenceTarget(Request $request, ChapterAuthority $authority): void
    {
        $chapterId = $authority->chapter->id;
        $evidence = $request->route('evidence_id')
            ? EvidenceRecord::where('chapter_id', $chapterId)->whereKey($request->route('evidence_id'))->sharedLock()->first()
            : null;
        $purpose = $evidence?->purpose ?? $request->input('purpose');
        $target = $evidence?->record_id ?? $request->input('record_id');
        $editing = ! $request->isMethodSafe();
        if ($editing && ! $request->route('evidence_id') && (! is_string($target)
            || ! in_array($purpose, ['opening_receipt', 'hold_clearance', 'actual_issue'], true))) {
            $message = 'Select a valid evidence target.';
            throw new ContractException(422, 'invalid_evidence', $message, [
                'error' => ['code' => 'invalid_evidence', 'message' => $message, 'fields' => [
                    ['pointer' => '/record_id', 'code' => 'invalid_target', 'message' => $message],
                ]],
            ]);
        }

        $allowed = false;
        $unit = null;

        if (is_string($target) && (! $request->route('evidence_id') || $evidence)) {
            $allowed = match ($purpose) {
                'opening_receipt' => $authority->allows($editing ? 'opening_rm.prepare' : 'opening_rm.read')
                    && OpeningRm::where('chapter_id', $chapterId)->whereKey($target)->exists(),
                'hold_clearance' => $authority->allows($editing ? 'hold.clear' : 'stock.read')
                    && StockHold::where('chapter_id', $chapterId)->whereKey($target)->exists(),
                default => false,
            };
            if ($purpose === 'actual_issue') {
                $issue = ActualIssue::where('chapter_id', $chapterId)->whereKey($target)->first();
                $rf = $issue?->rf()->where('chapter_id', $chapterId)->first();
                $unit = $rf?->requesting_unit_id;
                $allowed = $rf && $authority->canReadRf($rf) && $authority->allows('issue.prepare', $unit);
            }
        }

        if (! $allowed || ! $authority->allows($editing ? 'evidence.prepare' : 'evidence.read', $unit)
            || ($request->route('version_id') && ! $authority->allows('history.read', $unit))) {
            throw new ContractException(404, 'evidence_not_found', 'Evidence not found.');
        }
    }

    private function response(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($response->getStatusCode() === 404) {
            $code = match (true) {
                $request->is('*/evidence', '*/evidence/*') => 'evidence_not_found',
                $request->is('*/opening-actions/*') => 'operation_not_found',
                default => 'resource_not_found',
            };

            return EnforceBrowserAuthority::error(new ContractException(404, $code, 'Resource not found.'));
        }

        return $response;
    }
}
