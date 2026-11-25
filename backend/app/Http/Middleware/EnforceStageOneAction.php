<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\InternalRf;
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

        $rfList = $request->isMethod('GET') && $request->route()->getActionMethod() === 'listInternalRfs';
        $receipt = $request->isMethod('GET') && ($request->is('*/internal-rfs/operation-results', '*/internal-rfs/operation-results/*', '*/actual-issue-operations/*', '*/reservation-operations/*'));
        if (! $rfList && ! $receipt) {
            foreach ($actions as $action) {
                if ($action !== 'rf.draft' || $rf) {
                    $authority->requireAction($action, $rf?->requesting_unit_id);
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
