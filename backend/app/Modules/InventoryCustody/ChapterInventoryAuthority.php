<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use App\Modules\AccessChapterAdministration\BrowserSessions;
use App\Modules\AccessChapterAdministration\CurrentAuthority;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Chapter-scoped RBAC & GOV-03 provider isolation guard for Inventory, Demand, Finance, and Reporting modules.
 */
final class ChapterInventoryAuthority
{
    /** @var list<string> */
    public const array READ_ROLES = [
        'CHAPTER_HEAD', 'INVENTORY', 'BOOTH_CUSTODIAN', 'RF_APPROVER', 'COMMITTEE_REQUESTER',
        'INDEPENDENT_REVIEWER', 'RECEIVING', 'DISPATCH', 'PURCHASING', 'SALES_OFFICER', 'SALES_REVIEWER', 'FINANCE',
    ];

    public function __construct(private BrowserSessions $sessions, private CurrentAuthority $authority) {}

    /** @return array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} */
    public function authorizeRead(Request $r, string $chapterParam): array
    {
        return $this->authorizeRoles($r, $chapterParam, self::READ_ROLES);
    }

    /** @return array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} */
    public function authorizeInventoryWrite(Request $r, string $chapterParam): array
    {
        return $this->authorizeRoles($r, $chapterParam, ['CHAPTER_HEAD', 'INVENTORY']);
    }

    /** @return array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse} */
    public function authorizePolicyApproval(Request $r, string $chapterParam): array
    {
        return $this->authorizeRoles($r, $chapterParam, ['CHAPTER_HEAD', 'INDEPENDENT_REVIEWER']);
    }

    /**
     * @param  list<string>  $allowedRoles
     * @return array{ok: true, chapter_id: int, actor: array<string, mixed>}|array{ok: false, response: JsonResponse}
     */
    public function authorizeRoles(Request $r, string $chapterParam, array $allowedRoles, bool $requireMfa = false): array
    {
        $snap = $this->sessions->snapshot($r);
        $state = (string) ($snap['state'] ?? 'signed_out');
        if (in_array($state, ['mfa_enrollment_required', 'mfa_challenge_required'], true)) {
            return $this->err(403, 'MFA_REQUIRED', 'Multi-factor verification is required for this chapter action.');
        }
        if ($state !== 'authenticated') {
            return $this->err(401, 'UNAUTHENTICATED', 'Authentication is required for chapter access.');
        }
        if (preg_match('/^[1-9][0-9]{0,18}$/', $chapterParam) !== 1) {
            return $this->forbidden();
        }

        $cid = (int) $chapterParam;
        $userRef = (string) ($snap['user']['id'] ?? '');
        $user = DB::table('users')->where('status', 'active')
            ->where(fn ($q) => ctype_digit($userRef) ? $q->where('public_id', $userRef)->orWhere('id', (int) $userRef) : $q->where('public_id', $userRef))
            ->first();
        if ($user === null) {
            return $this->forbidden();
        }

        $mfaVerified = ($snap['mfa']['status'] ?? 'not_required') === 'verified';
        if (! $mfaVerified && ($requireMfa || $this->authority->requiresMfa((string) $user->id))) {
            return $this->err(403, 'MFA_REQUIRED', 'Multi-factor verification is required for this chapter action.');
        }

        $chapter = DB::table('chapters')->where('id', $cid)->whereIn('status', ['setup', 'live'])->first();
        $membership = $chapter !== null
            ? DB::table('memberships')->where('chapter_id', $cid)->where('user_id', (int) $user->id)
                ->where('status', 'active')->whereNull('disabled_at')->first()
            : null;
        if ($chapter === null || $membership === null) {
            return $this->forbidden();
        }

        $now = now()->format('Y-m-d H:i:s.u');
        $grant = DB::table('duty_grants as dg')->join('roles as r', 'r.id', '=', 'dg.role_id')
            ->where('dg.chapter_id', $cid)->where('dg.membership_id', (int) $membership->id)
            ->whereNull('dg.revoked_at')->where('dg.starts_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('dg.ends_at')->orWhere('dg.ends_at', '>=', $now))
            ->whereIn('r.code', $allowedRoles)
            ->orderByRaw("CASE r.code WHEN 'CHAPTER_HEAD' THEN 1 WHEN 'INVENTORY' THEN 2 WHEN 'INDEPENDENT_REVIEWER' THEN 3 ELSE 4 END")
            ->select('dg.id', 'dg.scope_kind', 'dg.requesting_unit_id', 'r.code as role_code')->first();
        if ($grant === null) {
            return $this->forbidden();
        }

        $allDuties = DB::table('duty_grants as dg')->join('roles as r', 'r.id', '=', 'dg.role_id')
            ->where('dg.chapter_id', $cid)->where('dg.membership_id', (int) $membership->id)
            ->whereNull('dg.revoked_at')->where('dg.starts_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('dg.ends_at')->orWhere('dg.ends_at', '>=', $now))
            ->pluck('r.code')->map(fn ($c): string => (string) $c)->unique()->values()->all();

        return ['ok' => true, 'chapter_id' => $cid, 'actor' => [
            'user_id' => (int) $user->id, 'public_id' => (string) $user->public_id, 'display_name' => (string) $user->name,
            'chapter_id' => $cid, 'chapter_code' => (string) $chapter->code, 'chapter_name' => (string) $chapter->name,
            'membership_id' => (int) $membership->id, 'authority_version' => (int) $membership->authority_version,
            'duty_grant_id' => (int) $grant->id, 'scope_kind' => (string) $grant->scope_kind,
            'requesting_unit_id' => $grant->requesting_unit_id !== null ? (int) $grant->requesting_unit_id : null,
            'role_code' => (string) $grant->role_code, 'duties' => $allDuties,
        ]];
    }

    /** @return array{ok: false, response: JsonResponse} */
    private function forbidden(): array
    {
        return $this->err(403, 'FORBIDDEN', 'Current authority does not permit this action or result.');
    }

    /** @return array{ok: false, response: JsonResponse} */
    private function err(int $status, string $code, string $message): array
    {
        return ['ok' => false, 'response' => response()->json([
            'schema_version' => '1.0', 'chapter_id' => null, 'action_result' => 'forbidden', 'operation' => null, 'record' => null,
            'field_feedback' => [], 'blocking_reason' => ['code' => $code, 'message' => $message],
            'permitted_next_actions' => [['code' => 'request_access', 'label' => 'Ask the authorized chapter administrator to review access']],
            'input_policy' => 'preserve', 'lookup_state' => null,
        ], $status)];
    }
}
