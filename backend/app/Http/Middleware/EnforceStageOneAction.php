<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Http\Requests\PaperEvidenceUpload;
use App\Models\ActualIssue;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\OpeningRm;
use App\Models\StockHold;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\StageTwoEvidenceTarget;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceStageOneAction
{
    public function handle(Request $request, Closure $next, string ...$actions): Response
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        foreach ($actions as $action) {
            if (! array_intersect($authority->duties(), (ChapterAuthority::ACTION_DUTIES[$action] ?? []))) {
                throw new ContractException(403, 'duty_denied', 'Current duty does not permit this action.');
            }
        }

        if (! $request->isMethodSafe()) {
            $authority->lockPoliciesFor($actions);
        }

        if ($request->is('*/evidence', '*/evidence/*')) {
            $this->authorizeEvidenceTarget($request, $authority, $actions);

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
        $receipt = $request->isMethod('GET') && $request->is('*/internal-rfs/operation-results', '*/internal-rfs/operation-results/*', '*/actual-issue-operations/*', '*/reservation-operations/*', '*/opening-actions/*');
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

    private function authorizeEvidenceTarget(Request $request, ChapterAuthority $authority, array $actions): void
    {
        $method = $request->route()->getActionMethod();
        foreach ($request->route()->parameters() as $id) {
            if (! preg_match(AuthInput::UUID, $id)) {
                throw PaperEvidenceUpload::malformed();
            }
        }
        if (in_array($method, ['show', 'showVersion', 'retrieveAttachment'], true)
            && ($request->server('QUERY_STRING', '') !== '' || $request->getContent() !== '')) {
            throw PaperEvidenceUpload::malformed();
        }

        $chapterId = $authority->chapter->id;
        $replacing = $request->routeIs('paper-evidence.replace');
        $upload = $method === 'upload' && ! $replacing ? PaperEvidenceUpload::parse($request) : null;
        $evidence = $upload ? null : EvidenceRecord::where('chapter_id', $chapterId)
            ->whereKey($request->route('evidence_id'))->first();
        $purpose = $upload?->purpose ?? $evidence?->purpose;
        $targetId = $upload?->recordId ?? $evidence?->record_id;
        $editing = ! $request->isMethodSafe();
        $unit = null;
        $editable = null;

        if ($targetId !== null && $purpose !== null && StageTwoEvidenceTarget::supports($purpose)) {
            $editable = StageTwoEvidenceTarget::authorize($authority, $purpose, $targetId, $editing, $evidence);
        } elseif ($targetId !== null) {
            $model = match ($purpose) {
                'opening_receipt' => OpeningRm::class,
                'hold_clearance' => StockHold::class,
                'actual_issue' => ActualIssue::class,
                default => null,
            };
            $query = $model === null ? null : $model::where('chapter_id', $chapterId)->whereKey($targetId);
            $allowed = match ($purpose) {
                'opening_receipt' => $authority->allows($editing ? 'opening_rm.prepare' : 'opening_rm.read')
                    && $query !== null,
                'hold_clearance' => $authority->allows($editing ? 'hold.clear' : 'stock.read')
                    && $query !== null,
                default => false,
            };
            if ($purpose === 'actual_issue') {
                $rfId = (clone $query)->value('requisition_id');
                $rf = $rfId ? InternalRf::where('chapter_id', $chapterId)->whereKey($rfId)->sharedLock()->first() : null;
                $unit = $rf?->requesting_unit_id;
                $allowed = $rf && $authority->canReadRf($rf)
                    && $authority->allows('issue.prepare', $unit) && $authority->allows('stock.read', $unit);
                $query->where('requisition_id', $rfId);
            }
            if ($allowed) {
                $target = ($editing ? $query->lockForUpdate() : $query->sharedLock())->first();
                if ($target) {
                    $editable = match ($purpose) {
                        'opening_receipt' => in_array(strtolower((string) $target->status), ['draft', 'inspected', 'matched', 'evidence_matched'], true),
                        'hold_clearance' => $target->status === 'active',
                        'actual_issue' => in_array($target->status, ['prepared', 'acknowledged'], true),
                    };
                }
            }
        }

        if ($editable === null || ! $authority->allows($editing ? 'evidence.prepare' : 'evidence.read', $unit)
            || (in_array('history.read', $actions, true) && ! $authority->allows('history.read', $unit))) {
            throw new ContractException(404, 'evidence_not_found', 'Evidence not found.');
        }

        if ($evidence) {
            $query = EvidenceRecord::whereKey($evidence->id);
            $evidence = ($editing ? $query->lockForUpdate() : $query->sharedLock())->firstOrFail();
        }
        if ($replacing) {
            $upload = PaperEvidenceUpload::parse($request, replacement: true);
        }

        $request->attributes->set(EvidenceRecord::class, $evidence);
        $request->attributes->set(PaperEvidenceUpload::class, $upload);
        $request->attributes->set('paper_evidence_target_editable', $editable);
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
