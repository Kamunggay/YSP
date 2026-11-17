<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChapterAccessController extends Controller
{
    private const ACTION_DUTIES = [
        'rf.read' => ['COMMITTEE_REQUESTER', 'RF_APPROVER', 'INVENTORY', 'DISPATCH'],
        'catalogue.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'COMMITTEE_REQUESTER', 'RF_APPROVER'],
        'catalogue.maintain' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'stock.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'INVENTORY_CUSTODIAN'],
        'evidence.read' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'RF_APPROVER', 'INVENTORY_CUSTODIAN'],
        'evidence.prepare' => ['INVENTORY', 'RECEIVING', 'DISPATCH', 'INVENTORY_CUSTODIAN'],
        'ipc.draft' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'ipc.authorize' => ['CHAPTER_HEAD', 'FINANCE'],
        'opening_rm.prepare' => ['RECEIVING', 'INVENTORY_CUSTODIAN'],
        'opening_rm.post' => ['RECEIVING', 'INVENTORY_CUSTODIAN'],
        'rf.draft' => ['COMMITTEE_REQUESTER'],
        'rf.submit' => ['COMMITTEE_REQUESTER'],
        'rf.approve' => ['RF_APPROVER'],
        'rf.reserve' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'rf.reallocate' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'hold.place' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'hold.clear' => ['INVENTORY', 'INVENTORY_CUSTODIAN'],
        'issue.prepare' => ['INVENTORY', 'DISPATCH', 'INVENTORY_CUSTODIAN'],
        'issue.post' => ['INVENTORY', 'DISPATCH', 'INVENTORY_CUSTODIAN'],
        'history.read' => ['COMMITTEE_REQUESTER', 'INVENTORY', 'RECEIVING', 'DISPATCH', 'RF_APPROVER', 'INVENTORY_CUSTODIAN'],
        'ipc.read' => ['INVENTORY', 'INDEPENDENT_REVIEWER', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE', 'INVENTORY_CUSTODIAN'],
        'ipc.count' => ['INVENTORY', 'INDEPENDENT_REVIEWER', 'INVENTORY_CUSTODIAN'],
        'opening_rm.read' => ['INVENTORY', 'RECEIVING', 'INVENTORY_CUSTODIAN'],
        'opening.result.read' => ['INVENTORY', 'INDEPENDENT_REVIEWER', 'RECEIVING', 'CHAPTER_HEAD', 'FINANCE', 'INVENTORY_CUSTODIAN'],
    ];

    public function context(Request $request, string $chapter_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        if (! $chapter) {
            return response()->json([
                'error' => [
                    'code' => 'chapter_not_found',
                    'message' => "Chapter {$chapter_id} not found.",
                ],
            ], 404);
        }

        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $membership = ChapterMembership::where('chapter_id', $chapter->id)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            return response()->json([
                'error' => [
                    'code' => 'membership_required',
                    'message' => 'User does not hold membership in this chapter.',
                ],
            ], 403);
        }

        $duties = DutyGrant::where('chapter_id', $chapter->id)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->get();

        $dutyCodes = $duties->pluck('duty_code')->unique()->values()->all();
        $dutyGrantsList = $duties->map(fn ($d) => [
            'id' => $d->id,
            'duty' => $d->duty_code,
            'scope' => $d->scope ?? ['unit_id' => null, 'limit_php' => null],
            'effective_from' => $d->valid_from ? $d->valid_from->toIso8601ZuluString() : $d->created_at->toIso8601ZuluString(),
            'effective_until' => $d->valid_until ? $d->valid_until->toIso8601ZuluString() : null,
        ])->all();

        return response()->json([
            'data' => [
                'user_id' => $userId,
                'membership' => [
                    'id' => $membership->id,
                    'chapter' => [
                        'id' => $chapter->id,
                        'reference' => $chapter->code,
                        'display_name' => $chapter->name,
                        'created_at' => $chapter->created_at->toIso8601ZuluString(),
                    ],
                    'duties' => $dutyCodes,
                    'authority_version' => $membership->version ?? 1,
                    'duty_grants' => $dutyGrantsList,
                ],
                'checked_at' => now()->toIso8601ZuluString(),
            ],
        ]);
    }

    public function access(Request $request, string $chapter_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        if (! $chapter) {
            return response()->json([
                'error' => [
                    'code' => 'chapter_not_found',
                    'message' => "Chapter {$chapter_id} not found.",
                ],
            ], 404);
        }

        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $userDuties = DutyGrant::where('chapter_id', $chapter->id)
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->pluck('duty_code')
            ->toArray();

        $actions = [];
        foreach (self::ACTION_DUTIES as $action => $requiredDuties) {
            $hasDuty = ! empty(array_intersect($userDuties, $requiredDuties));
            $actions[] = [
                'action' => $action,
                'state' => $hasDuty ? 'allowed' : 'duty_denied',
                'required_duties' => array_values(array_intersect($requiredDuties, [
                    'COMMITTEE_REQUESTER', 'RF_APPROVER', 'SALES_OFFICER', 'SALES_REVIEWER',
                    'FINANCE', 'INVENTORY', 'PURCHASING', 'BUDGET_APPROVER', 'RECEIVING',
                    'DISPATCH', 'BOOTH_CUSTODIAN', 'BOOTH_CASHIER', 'INDEPENDENT_REVIEWER', 'CHAPTER_HEAD',
                ])) ?: ['INVENTORY'],
                'blockers' => [],
            ];
        }

        return response()->json([
            'data' => [
                'chapter_id' => $chapter->id,
                'user_id' => $userId,
                'authority_version' => 1,
                'setup_version' => 1,
                'checked_at' => now()->toIso8601ZuluString(),
                'actions' => $actions,
            ],
        ]);
    }
}
