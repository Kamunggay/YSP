<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Models\ActualIssue;
use App\Models\ChapterMembership;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\OpeningRm;
use App\Models\StockHold;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Evidence\StageTwoEvidenceTarget;
use App\Services\Shared\CanonicalJson;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class CandidateListController extends Controller
{
    private const STAGE_ONE_EVIDENCE_PURPOSES = ['opening_receipt', 'hold_clearance', 'actual_issue'];

    private const EVENT_STATUSES = ['planned', 'active'];

    private const EVIDENCE_COLUMNS = [
        'id', 'version_id', 'version', 'position', 'mime_type', 'file_size', 'sha256_hash', 'payload_path',
        'replacement_reason', 'created_by', 'created_at',
    ];

    public function officers(Request $request): JsonResponse
    {
        $authority = $this->authority($request);
        $selectors = OpeningDraftInput::selectors($request, ['q', 'duty', 'requesting_unit_id', 'exclude_user_id', 'limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $search = $this->parseSearch($selectors['q'] ?? null);
        $duty = $this->parseOptionalDuty($selectors['duty'] ?? null);
        $unitId = isset($selectors['requesting_unit_id'])
            ? OpeningDraftInput::requireUuid($selectors['requesting_unit_id'], 'requesting_unit_id') : null;
        $excludeUserId = isset($selectors['exclude_user_id'])
            ? OpeningDraftInput::requireUuid($selectors['exclude_user_id'], 'exclude_user_id') : null;

        $chapter = $authority->chapter;
        if ($unitId !== null && ! DB::table('chapter_organizational_units')
            ->where('chapter_id', $chapter->id)->where('id', $unitId)->whereNull('ended_at')->sharedLock()->exists()) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        $memberships = ChapterMembership::query()
            ->where('chapter_memberships.chapter_id', $chapter->id)
            ->current()
            ->join('users', 'users.id', '=', 'chapter_memberships.user_id')
            ->whereIn('users.status', ['active', 'enabled'])
            ->when($excludeUserId !== null, fn ($query) => $query->where('chapter_memberships.user_id', '!=', $excludeUserId))
            ->orderBy('chapter_memberships.user_id')
            ->sharedLock()
            ->get(['chapter_memberships.*', 'users.name as user_name', 'users.public_id as user_public_id']);

        $items = [];
        foreach ($memberships as $membership) {
            $memberAuth = ChapterAuthority::fromMembership($membership, $chapter);
            $grants = $memberAuth->grants->filter(fn ($grant) => ($duty === null || $grant->duty_code === $duty)
                && ($unitId === null || ChapterAuthority::covers($grant, $unitId)));
            $matchedDuties = array_values(array_intersect(ChapterAuthority::DUTIES, $grants->pluck('duty_code')->all()));
            if ($matchedDuties === []) {
                continue;
            }

            $displayName = (string) $membership->getAttribute('user_name');
            $publicId = (string) $membership->getAttribute('user_public_id');
            if (! $this->matchesSearch($search, [$displayName, $publicId, ...$matchedDuties])) {
                continue;
            }

            $items[] = [
                'user_id' => $membership->user_id,
                'public_id' => $publicId,
                'display_name' => $displayName,
                'duties' => $matchedDuties,
                'unit_ids' => $grants->map(fn ($grant) => $grant->scope['unit_id'] ?? null)
                    ->filter(fn ($value) => is_string($value) && $value !== '')
                    ->unique()->sort()->values()->all(),
                'has_chapter_wide_scope' => $grants->contains(fn ($grant) => ($grant->scope['unit_id'] ?? null) === null),
            ];
        }

        usort($items, fn (array $a, array $b) => [mb_strtolower($a['display_name']), mb_strtolower($a['public_id']), $a['user_id']]
            <=> [mb_strtolower($b['display_name']), mb_strtolower($b['public_id']), $b['user_id']]);

        return $this->paginate($request, $authority, 'officers', $items, $limit, $selectors['cursor'] ?? null, [
            'q' => $search, 'duty' => $duty, 'requesting_unit_id' => $unitId, 'exclude_user_id' => $excludeUserId,
        ]);
    }

    public function requestingUnits(Request $request): JsonResponse
    {
        $authority = $this->authority($request);
        $selectors = OpeningDraftInput::selectors($request, ['q', 'for_duty', 'limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $search = $this->parseSearch($selectors['q'] ?? null);
        $forDuty = $this->parseOptionalDuty($selectors['for_duty'] ?? null);
        $chapter = $authority->chapter;

        $rows = DB::table('chapter_organizational_units')
            ->where('chapter_id', $chapter->id)
            ->whereNull('ended_at')
            ->orderBy('id')
            ->sharedLock()
            ->get(['id', 'chapter_id', 'code', 'name']);

        $items = [];
        foreach ($rows as $row) {
            if ($forDuty !== null && ! $authority->grants->contains(
                fn ($grant) => $grant->duty_code === $forDuty && ChapterAuthority::covers($grant, $row->id)
            )) {
                continue;
            }

            $fallbackCode = 'UNIT-'.strtoupper(substr(str_replace('-', '', $row->id), 0, 8));
            $code = is_string($row->code) && trim($row->code) !== '' ? trim($row->code) : $fallbackCode;
            $name = is_string($row->name) && trim($row->name) !== '' ? trim($row->name) : 'Unit '.$code;
            if (! $this->matchesSearch($search, [$code, $name])) {
                continue;
            }

            $items[] = [
                'unit_id' => $row->id,
                'chapter_id' => $row->chapter_id,
                'code' => $code,
                'name' => $name,
                'active' => true,
            ];
        }

        usort($items, fn (array $a, array $b) => [mb_strtolower($a['code']), mb_strtolower($a['name']), $a['unit_id']]
            <=> [mb_strtolower($b['code']), mb_strtolower($b['name']), $b['unit_id']]);

        return $this->paginate($request, $authority, 'requesting-units', $items, $limit, $selectors['cursor'] ?? null, [
            'q' => $search, 'for_duty' => $forDuty,
        ]);
    }

    public function evidence(Request $request, PaperEvidenceStore $store): JsonResponse
    {
        $authority = $this->authority($request);
        $selectors = OpeningDraftInput::selectors($request, ['purpose', 'record_id', 'q', 'limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $search = $this->parseSearch($selectors['q'] ?? null);
        $purpose = $selectors['purpose'] ?? null;
        if (! is_string($purpose) || (! in_array($purpose, self::STAGE_ONE_EVIDENCE_PURPOSES, true) && ! StageTwoEvidenceTarget::supports($purpose))) {
            throw new ContractException(400, 'invalid_selector', 'Invalid evidence purpose selector.');
        }
        if (! isset($selectors['record_id'])) {
            throw new ContractException(400, 'invalid_selector', 'Missing record_id selector.');
        }
        $recordId = OpeningDraftInput::requireUuid($selectors['record_id'], 'record_id');

        if (! $this->authorizeEvidenceTargetRead($authority, $purpose, $recordId)) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        $records = EvidenceRecord::where('chapter_id', $authority->chapter->id)
            ->where('purpose', $purpose)
            ->where('record_id', $recordId)
            ->where('technical_state', 'ready')
            ->orderByDesc('created_at')
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $ready = [];
        $uploaderIds = [];
        foreach ($records as $record) {
            $first = $record->currentVersionBlob();
            if (! $first) {
                continue;
            }
            $blobs = $record->exactVersion($record->versionId($first), self::EVIDENCE_COLUMNS);
            if ($blobs->isEmpty() || $store->checkVersion($blobs)[1] !== null) {
                continue;
            }
            $head = $blobs->first();
            $uploaderIds[$head->created_by] = true;
            $ready[] = [$record, $blobs, $head];
        }

        $uploaders = $uploaderIds === []
            ? collect()
            : User::whereIn('id', array_keys($uploaderIds))->sharedLock()->get(['id', 'name', 'public_id'])->keyBy('id');

        $items = [];
        foreach ($ready as [$record, $blobs, $head]) {
            $uploader = $uploaders->get($head->created_by);
            $uploaderName = $uploader?->name ?? $head->created_by;
            $uploaderPublicId = $uploader?->public_id ?? $head->created_by;
            $versionId = $record->versionId($head);
            $attachments = $blobs->values()->map(fn (EvidenceBlob $blob, int $index) => [
                'attachment_id' => $blob->id,
                'position' => (int) ($blob->position ?? $index + 1),
                'media_type' => $blob->mime_type,
                'byte_length' => (int) $blob->file_size,
                'sha256' => $blob->sha256_hash,
            ])->all();

            $haystacks = [
                $record->id,
                $versionId,
                $uploaderName,
                $uploaderPublicId,
                $head->replacement_reason,
                ...array_merge(...array_map(fn (array $att) => [$att['attachment_id'], $att['media_type'], $att['sha256']], $attachments)),
            ];
            if (! $this->matchesSearch($search, $haystacks)) {
                continue;
            }

            $items[] = [
                'evidence_id' => $record->id,
                'chapter_id' => $record->chapter_id,
                'target' => ['purpose' => $record->purpose, 'record_id' => $record->record_id],
                'version_id' => $versionId,
                'version' => (int) $head->version,
                'technical_state' => 'ready',
                'uploaded_by' => $head->created_by,
                'uploaded_by_name' => $uploaderName,
                'uploaded_by_public_id' => $uploaderPublicId,
                'uploaded_at' => $head->created_at->utc()->format('Y-m-d\TH:i:s.u\Z'),
                'replacement_reason' => $head->replacement_reason,
                'attachments' => $attachments,
            ];
        }

        usort($items, fn (array $a, array $b) => [$b['uploaded_at'], $a['evidence_id']] <=> [$a['uploaded_at'], $b['evidence_id']]);

        return $this->paginate($request, $authority, 'evidence', $items, $limit, $selectors['cursor'] ?? null, [
            'purpose' => $purpose, 'record_id' => $recordId, 'q' => $search,
        ]);
    }

    public function events(Request $request): JsonResponse
    {
        $authority = $this->authority($request);
        $selectors = OpeningDraftInput::selectors($request, ['q', 'status', 'limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $search = $this->parseSearch($selectors['q'] ?? null);
        $status = $selectors['status'] ?? null;
        if ($status !== null && ! in_array($status, self::EVENT_STATUSES, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid event status selector.');
        }

        $rows = DB::table('chapter_events')
            ->where('chapter_id', $authority->chapter->id)
            ->whereIn('status', $status !== null ? [$status] : self::EVENT_STATUSES)
            ->orderBy('id')
            ->sharedLock()
            ->get(['id', 'chapter_id', 'code', 'name', 'status', 'starts_at', 'ends_at']);

        $items = [];
        foreach ($rows as $row) {
            if (! $this->matchesSearch($search, [$row->code, $row->name])) {
                continue;
            }
            $items[] = [
                'event_id' => $row->id,
                'chapter_id' => $row->chapter_id,
                'code' => $row->code,
                'name' => $row->name,
                'status' => $row->status,
                'starts_at' => $row->starts_at !== null ? CarbonImmutable::parse($row->starts_at, 'UTC')->utc()->format('Y-m-d\TH:i:s.u\Z') : null,
                'ends_at' => $row->ends_at !== null ? CarbonImmutable::parse($row->ends_at, 'UTC')->utc()->format('Y-m-d\TH:i:s.u\Z') : null,
            ];
        }

        usort($items, fn (array $a, array $b) => [
            $a['starts_at'] === null ? 1 : 0, $a['starts_at'] ?? '', mb_strtolower($a['code']), $a['event_id'],
        ] <=> [
            $b['starts_at'] === null ? 1 : 0, $b['starts_at'] ?? '', mb_strtolower($b['code']), $b['event_id'],
        ]);

        return $this->paginate($request, $authority, 'events', $items, $limit, $selectors['cursor'] ?? null, [
            'q' => $search, 'status' => $status,
        ]);
    }

    private function authority(Request $request): ChapterAuthority
    {
        return $request->attributes->get(ChapterAuthority::class);
    }

    private function authorizeEvidenceTargetRead(ChapterAuthority $authority, string $purpose, string $recordId): bool
    {
        if (StageTwoEvidenceTarget::supports($purpose)) {
            return StageTwoEvidenceTarget::authorize($authority, $purpose, $recordId, false, null) !== null;
        }

        $chapterId = $authority->chapter->id;
        if ($purpose === 'opening_receipt') {
            return $authority->allows('opening_rm.read')
                && OpeningRm::where('chapter_id', $chapterId)->whereKey($recordId)->sharedLock()->exists();
        }
        if ($purpose === 'hold_clearance') {
            return $authority->allows('stock.read')
                && StockHold::where('chapter_id', $chapterId)->whereKey($recordId)->sharedLock()->exists();
        }
        if ($purpose === 'actual_issue') {
            $issue = ActualIssue::where('chapter_id', $chapterId)->whereKey($recordId)->sharedLock()->first();
            $rf = $issue ? InternalRf::where('chapter_id', $chapterId)->whereKey($issue->requisition_id)->sharedLock()->first() : null;
            $unit = $rf?->requesting_unit_id;

            return $rf !== null && $authority->canReadRf($rf)
                && $authority->allows('issue.prepare', $unit)
                && $authority->allows('stock.read', $unit)
                && $authority->allows('evidence.read', $unit);
        }

        return false;
    }

    private function parseLimit(?string $raw): int
    {
        if ($raw === null) {
            return 25;
        }
        if (! preg_match('/\A[1-9][0-9]{0,2}\z/', $raw)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }
        $limit = (int) $raw;
        if ($limit < 1 || $limit > 100) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }

        return $limit;
    }

    private function parseSearch(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $trimmed = trim($raw, ' ');
        if ($trimmed === '' || mb_strlen($trimmed) > 80) {
            throw new ContractException(400, 'invalid_selector', 'Invalid search selector.');
        }

        return $trimmed;
    }

    private function parseOptionalDuty(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        if (! in_array($raw, ChapterAuthority::DUTIES, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid duty selector.');
        }

        return $raw;
    }

    /** @param list<string|null> $haystacks */
    private function matchesSearch(?string $query, array $haystacks): bool
    {
        if ($query === null) {
            return true;
        }
        foreach ($haystacks as $value) {
            if (is_string($value) && $value !== '' && mb_stripos($value, $query) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @param  array<string, mixed>  $filters
     */
    private function paginate(
        Request $request,
        ChapterAuthority $authority,
        string $endpoint,
        array $items,
        int $limit,
        ?string $rawCursor,
        array $filters,
    ): JsonResponse {
        $filterHash = hash('sha256', CanonicalJson::encode($filters));
        $snapshot = hash('sha256', CanonicalJson::encode([
            'membership_id' => $authority->membership->id,
            'authority_version' => $authority->version,
            'items' => $items,
        ]));
        $snapshotVersion = 1 + (hexdec(substr($snapshot, 0, 7)) & 0x7FFFFFFE);

        $offset = 0;
        $expires = now()->addMinutes(5)->timestamp;
        if ($rawCursor !== null) {
            if (strlen($rawCursor) > 1024 || trim($rawCursor) === '') {
                throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
            }
            try {
                $decoded = json_decode(Crypt::decryptString($rawCursor), true, flags: JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException) {
                throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
            }
            if (! is_array($decoded)
                || ($decoded['v'] ?? null) !== 1
                || ($decoded['e'] ?? null) !== $endpoint
                || ($decoded['u'] ?? null) !== $request->user()->id
                || ($decoded['c'] ?? null) !== $authority->chapter->id
                || ($decoded['l'] ?? null) !== $limit
                || ($decoded['f'] ?? null) !== $filterHash
                || ! is_int($decoded['o'] ?? null)
                || ! is_int($decoded['x'] ?? null)
                || ! is_string($decoded['s'] ?? null)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
            }
            if ($decoded['x'] <= now()->timestamp || ! hash_equals($decoded['s'], $snapshot)) {
                throw new ContractException(409, 'snapshot_stale', 'Candidate snapshot cursor expired or underlying state changed; restart from page 1.');
            }
            if ($decoded['o'] <= 0 || $decoded['o'] >= count($items)) {
                throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
            }

            $offset = $decoded['o'];
            $expires = $decoded['x'];
        }

        $next = $offset + $limit < count($items)
            ? Crypt::encryptString(json_encode([
                'v' => 1,
                'e' => $endpoint,
                'u' => $request->user()->id,
                'c' => $authority->chapter->id,
                'l' => $limit,
                'f' => $filterHash,
                's' => $snapshot,
                'o' => $offset + $limit,
                'x' => $expires,
            ], JSON_THROW_ON_ERROR))
            : null;

        return response()->json([
            'data' => array_slice($items, $offset, $limit),
            'page' => [
                'next_cursor' => $next,
                'snapshot_version' => $snapshotVersion,
            ],
        ]);
    }
}
