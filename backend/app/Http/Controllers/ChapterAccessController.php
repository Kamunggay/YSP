<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Services\Authority\ChapterAuthority;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

class ChapterAccessController extends Controller
{
    public function memberships(Request $request): JsonResponse
    {
        $selectors = $this->selectors($request, ['limit', 'cursor']);
        $limit = filter_var($selectors['limit'] ?? '25', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        if ($limit === false || (isset($selectors['cursor']) && strlen($selectors['cursor']) > 1024)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid membership selector.');
        }

        $user = $request->user();
        $items = $user->memberships()->current()
            ->join('chapters', 'chapters.id', '=', 'chapter_memberships.chapter_id')
            ->whereIn('chapters.status', ChapterAuthority::AVAILABLE_CHAPTERS)
            ->orderBy('chapters.created_at')->orderBy('chapters.id')->select('chapter_memberships.*')->sharedLock()
            ->with('chapter')->get()
            ->map(fn ($membership) => $this->membership(ChapterAuthority::fromMembership($membership, $membership->chapter)))
            ->all();

        $snapshot = hash('sha256', json_encode($items, JSON_THROW_ON_ERROR));
        $offset = 0;
        if (isset($selectors['cursor'])) {
            try {
                $cursor = json_decode(Crypt::decryptString($selectors['cursor']), true, flags: JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException) {
                throw new ContractException(400, 'invalid_selector', 'Invalid membership cursor.');
            }
            if (($cursor['user'] ?? null) !== $user->id || ($cursor['limit'] ?? null) !== $limit) {
                throw new ContractException(400, 'invalid_selector', 'Invalid membership cursor.');
            }
            if ($cursor['expires'] <= now()->timestamp || $cursor['snapshot'] !== $snapshot) {
                throw new ContractException(409, 'snapshot_stale', 'Restart membership discovery.');
            }

            $offset = $cursor['offset'];
        }
        $next = $offset + $limit < count($items) ? Crypt::encryptString(json_encode([
            'user' => $user->id, 'limit' => $limit, 'snapshot' => $snapshot, 'offset' => $offset + $limit,
            'expires' => $cursor['expires'] ?? now()->addMinutes(5)->timestamp,
        ], JSON_THROW_ON_ERROR)) : null;

        return response()->json(['data' => array_slice($items, $offset, $limit), 'page' => ['next_cursor' => $next]]);
    }

    public function context(Request $request): JsonResponse
    {
        $this->selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);

        return response()->json(['data' => [
            'user_id' => $request->user()->id,
            'membership' => $this->membership($authority),
            'checked_at' => now()->toISOString(),
        ]]);
    }

    public function access(Request $request): JsonResponse
    {
        $this->selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $policies = $authority->chapter->policyRecords()->orderByDesc('policy_version')->orderBy('id')->get();

        $actions = [];
        $blockersByAction = $authority->chapterPolicyBlockers($policies);
        foreach (ChapterAuthority::ACTION_DUTIES as $action => $requiredDuties) {
            $blockers = [];
            $state = 'duty_denied';
            if (array_intersect($authority->duties(), $requiredDuties)) {
                $state = $authority->allows($action) && in_array($action, ['catalogue.read', 'catalogue.maintain', 'rf.draft', 'ipc.draft'], true)
                    ? 'allowed' : 'context_required';

                $blockers = $blockersByAction[$action] ?? [];
                if ($blockers) {
                    $state = 'setup_blocked';
                }
            }
            $actions[] = ['action' => $action, 'state' => $state, 'required_duties' => $requiredDuties, 'blockers' => $blockers];
        }

        return response()->json(['data' => [
            'chapter_id' => $authority->chapter->id,
            'user_id' => $request->user()->id,
            'authority_version' => $authority->version,
            'setup_version' => 1 + (int) $policies->sum('policy_version'),
            'checked_at' => now()->toISOString(),
            'actions' => $actions,
        ]]);
    }

    private function membership(ChapterAuthority $authority): array
    {
        $chapter = $authority->chapter;

        return [
            'id' => $authority->membership->id,
            'chapter' => [
                'id' => $chapter->id,
                'reference' => $chapter->code,
                'display_name' => $chapter->name,
                'created_at' => $chapter->created_at->toISOString(),
            ],
            'duties' => $authority->duties(),
            'authority_version' => $authority->version,
            'duty_grants' => $authority->grants->map(fn ($grant) => [
                'id' => $grant->id,
                'duty' => $grant->duty_code,
                'scope' => ['unit_id' => $grant->scope['unit_id'] ?? null, 'limit_php' => $grant->scope['limit_php'] ?? null],
                'effective_from' => ($grant->valid_from ?? $grant->created_at)->toISOString(),
                'effective_until' => $grant->valid_until?->toISOString(),
            ])->all(),
        ];
    }

    private function selectors(Request $request, array $allowed = []): array
    {
        $query = $request->server('QUERY_STRING', '');
        $selectors = [];
        if ($request->getContent() !== '') {
            throw new ContractException(400, 'invalid_selector', 'Invalid authority selector.');
        }
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($key);
            if (! in_array($key, $allowed, true) || isset($selectors[$key]) || $value === '') {
                throw new ContractException(400, 'invalid_selector', 'Invalid authority selector.');
            }
            $selectors[$key] = urldecode($value);
        }

        return $selectors;
    }
}
