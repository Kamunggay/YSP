<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\PaperEvidenceDownload;
use App\Http\Requests\PaperEvidenceUpload;
use App\Models\ActionReceipt;
use App\Models\AuditLog;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\PaperEvidenceContent;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class PaperEvidenceController extends Controller
{
    private const MANIFEST_COLUMNS = [
        'id', 'version_id', 'version', 'position', 'mime_type', 'file_size', 'sha256_hash', 'payload_path',
        'supersedes_version_id', 'superseded_by_version_id', 'replacement_reason', 'created_by', 'created_at',
    ];

    public function upload(
        Request $request,
        string $chapter_id,
        PaperEvidenceContent $content,
        PaperEvidenceStore $store,
        DomainNotificationOutboxService $outbox,
    ): JsonResponse {
        /** @var PaperEvidenceUpload $upload */
        $upload = $request->attributes->get(PaperEvidenceUpload::class);
        $actor = $request->user()->id;
        $previous = null;
        $replacing = $upload->expectedVersion !== null;
        $operation = $replacing ? 'replacePaperEvidence' : 'uploadPaperEvidence';
        $projectionTime = now('UTC')->startOfSecond();
        $record = $request->attributes->get(EvidenceRecord::class) ?? new EvidenceRecord([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter_id,
            'evidence_type' => 'paper',
            'purpose' => $upload->purpose,
            'record_id' => $upload->recordId,
            'technical_state' => 'ready',
            'created_by' => $actor,
            'created_at' => $projectionTime,
        ]);
        if ($replacing) {
            $previous = $this->currentBlobs($record)->first() ?? throw $this->notFound();
        }
        $version = ($previous?->version ?? 0) + 1;
        $versionId = (string) Str::uuid();
        $blobs = new Collection;
        $attachmentIdentity = [];
        foreach ($upload->files as $index => $file) {
            $metadata = $content->validate($file['bytes'], $file['media_type'], $index);
            $attachmentIdentity[] = $metadata;
            $blobs->push(new EvidenceBlob([
                'id' => (string) Str::uuid(),
                'version_id' => $versionId,
                'version' => $version,
                'supersedes_version_id' => $previous ? $record->versionId($previous) : null,
                'replacement_reason' => $upload->reason,
                'position' => $index + 1,
                'mime_type' => $metadata['media_type'],
                'file_size' => $metadata['byte_length'],
                'sha256_hash' => $metadata['sha256'],
                'created_by' => $actor,
                'created_at' => $projectionTime,
            ]));
        }

        $scope = ['chapter_id' => $chapter_id, 'user_id' => $actor, 'operation' => $operation, 'key' => $upload->key];
        $intent = ['target' => $this->target($record), 'attachments' => $attachmentIdentity];
        if ($replacing) {
            $intent += ['evidence_id' => $record->id, 'expected_version' => $upload->expectedVersion, 'reason' => $upload->reason];
        }
        $fingerprint = CanonicalJson::sha256($intent);
        try {
            $receipt = ActionReceipt::record($scope, $fingerprint, 201, ['data' => $this->version($record, $blobs)]);
            if (! $receipt->wasRecentlyCreated) {
                return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
            }

            $target = $request->attributes->get('paper_evidence_target');
            $editable = match ($record->purpose) {
                'opening_receipt' => in_array($target->status, ['DRAFT', 'INSPECTED', 'EVIDENCE_MATCHED'], true),
                'hold_clearance' => $target->status === 'active',
                'actual_issue' => in_array($target->status, ['prepared', 'acknowledged'], true),
            };
            if (! $editable) {
                throw new ContractException(409, 'target_locked', 'The evidence target is no longer editable.');
            }

            if ($previous && (int) $previous->version !== $upload->expectedVersion) {
                throw new ContractException(409, 'version_conflict', 'The current evidence version has changed.');
            }

            foreach ($blobs as $index => $blob) {
                $blob->payload_path = $store->store($actor, $blob->id, $upload->files[$index]['bytes'], $blob->sha256_hash);
            }
            if ($previous) {
                $record->blobs()->where('version', $previous->version)->update(['superseded_by_version_id' => $versionId]);
                EvidenceBinding::where('evidence_id', $record->id)->where('status', 'active')->update(['status' => 'invalidated']);
            } else {
                $record->save();
            }
            $record->blobs()->saveMany($blobs);
            AuditLog::create([
                'chapter_id' => $chapter_id,
                'user_id' => $actor,
                'action' => $operation,
                'entity_type' => 'paper_evidence',
                'entity_id' => $record->id,
                'details' => ['version_id' => $versionId],
            ]);
            $outbox->recordIntent('stage1.paper-evidence.changed.v1', $chapter_id, $record->id, $version);
        } catch (QueryException) {
            throw PaperEvidenceContent::unavailable();
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'false']);
    }

    public function show(Request $request, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $blobs = $this->currentBlobs($record);
        if ($blobs->isEmpty()) {
            throw $this->notFound();
        }

        return response()->json(['data' => [
            'evidence_id' => $record->id,
            'chapter_id' => $record->chapter_id,
            'target' => $this->target($record),
            'current_version' => $this->version($record, $blobs, $store->checkVersion($blobs)[1]),
        ]]);
    }

    public function versions(Request $request, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $query = $request->server('QUERY_STRING', '');
        $selectors = [];
        if ($request->getContent() !== '') {
            throw PaperEvidenceUpload::malformed();
        }
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($key);
            if (! in_array($key, ['limit', 'cursor'], true) || isset($selectors[$key]) || $value === '') {
                throw PaperEvidenceUpload::malformed();
            }
            $selectors[$key] = urldecode($value);
        }
        $limit = filter_var($selectors['limit'] ?? '25', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        if ($limit === false || strlen($selectors['cursor'] ?? '') > 1024) {
            throw PaperEvidenceUpload::malformed();
        }

        $scope = [$request->user()->id, $record->chapter_id, $record->id, $limit];
        $generation = [$authority->membership->id, $authority->version, $record->currentVersion()];
        $after = [1, null];
        if (isset($selectors['cursor'])) {
            try {
                $cursor = json_decode(Crypt::decryptString($selectors['cursor']), true, flags: JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException) {
                throw PaperEvidenceUpload::malformed();
            }
            if (($cursor['scope'] ?? null) !== $scope) {
                throw PaperEvidenceUpload::malformed();
            }
            if ($cursor['expires'] <= now()->timestamp || $cursor['generation'] !== $generation) {
                throw new ContractException(409, 'snapshot_stale', 'Restart evidence history discovery.');
            }
            $after = $cursor['after'];
        }

        $numbers = $record->blobs()->where('version', '>=', $after[0])->distinct()->orderBy('version')->limit($limit + 2)
            ->sharedLock()->pluck('version');
        $page = [];
        $passedCursor = $after[1] === null;
        foreach ($numbers as $number) {
            foreach ($record->versionBlobs($number, self::MANIFEST_COLUMNS)->groupBy(fn (EvidenceBlob $blob) => $record->versionId($blob)) as $id => $blobs) {
                if (! $passedCursor) {
                    $passedCursor = [$number, $id] === $after;

                    continue;
                }
                $page[] = $blobs;
                if (count($page) > $limit) {
                    break 2;
                }
            }
        }
        $next = null;
        if (count($page) > $limit) {
            array_pop($page);
            $last = $page[$limit - 1]->first();
            $next = Crypt::encryptString(json_encode([
                'scope' => $scope, 'generation' => $generation, 'after' => [$last->version, $record->versionId($last)],
                'expires' => $cursor['expires'] ?? now()->addMinutes(5)->timestamp,
            ], JSON_THROW_ON_ERROR));
        }
        $versions = array_map(fn ($blobs) => $this->version($record, $blobs, $store->checkVersion($blobs)[1]), $page);

        return response()->json(['data' => ['versions' => $versions, 'next_cursor' => $next]]);
    }

    public function showVersion(Request $request, string $chapter_id, string $evidence_id, string $version_id, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $blobs = $this->findVersion($record, $version_id);

        return response()->json(['data' => $this->version($record, $blobs, $store->checkVersion($blobs)[1])]);
    }

    public function retrieveAttachment(
        Request $request,
        string $chapter_id,
        string $evidence_id,
        string $version_id,
        string $attachment_id,
        PaperEvidenceStore $store,
    ): Response {
        $record = $request->attributes->get(EvidenceRecord::class);
        $blobs = $this->findVersion($record, $version_id);
        $attachment = $blobs->find($attachment_id);
        if (! $attachment) {
            throw $this->notFound();
        }
        [$bytes, $invalidReason] = $store->checkVersion($blobs, $attachment_id);
        if ($invalidReason !== null) {
            throw PaperEvidenceContent::unavailable();
        }

        $extension = PaperEvidenceContent::EXTENSIONS[$attachment->mime_type];

        return new PaperEvidenceDownload($bytes, 200, [
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => "attachment; filename=\"{$attachment_id}.{$extension}\"",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @return Collection<int, EvidenceBlob> */
    private function findVersion(EvidenceRecord $record, string $versionId): Collection
    {
        $blobs = $record->exactVersion($versionId, self::MANIFEST_COLUMNS);
        if ($blobs->isEmpty()) {
            throw $this->notFound();
        }

        return $blobs;
    }

    /** @return Collection<int, EvidenceBlob> */
    private function currentBlobs(EvidenceRecord $record): Collection
    {
        $blobs = $record->versionBlobs($record->currentVersion(), self::MANIFEST_COLUMNS);
        $first = $blobs->first();

        return $first ? $blobs->filter(fn (EvidenceBlob $blob) => $record->versionId($blob) === $record->versionId($first)) : $blobs;
    }

    /** @param Collection<int, EvidenceBlob> $blobs */
    private function version(EvidenceRecord $record, Collection $blobs, ?string $invalidReason = null): array
    {
        $first = $blobs->first();

        return [
            'evidence_id' => $record->id,
            'chapter_id' => $record->chapter_id,
            'target' => $this->target($record),
            'version_id' => $record->versionId($first),
            'version' => (int) $first->version,
            'supersedes_version_id' => $first->supersedes_version_id,
            'superseded_by_version_id' => $first->superseded_by_version_id,
            'technical_state' => $invalidReason === null ? 'ready' : 'invalid',
            'invalid_reason' => $invalidReason,
            'uploaded_by' => $first->created_by,
            'uploaded_at' => $first->created_at->utc()->format('Y-m-d\TH:i:s.u\Z'),
            'replacement_reason' => $first->replacement_reason,
            'attachments' => $blobs->values()->map(fn (EvidenceBlob $blob, int $index) => [
                'attachment_id' => $blob->id,
                'position' => (int) ($blob->position ?? $index + 1),
                'media_type' => $blob->mime_type,
                'byte_length' => (int) $blob->file_size,
                'sha256' => $blob->sha256_hash,
            ])->all(),
        ];
    }

    private function target(EvidenceRecord $record): array
    {
        return ['purpose' => $record->purpose, 'record_id' => $record->record_id];
    }

    private function notFound(): ContractException
    {
        return new ContractException(404, 'evidence_not_found', 'Evidence not found.');
    }

    public static function checkEvidenceBinding(
        string $chapterId,
        string $sourceType,
        string $sourceId,
        string $recipientName,
        array $items
    ): bool {
        $participant = app(CheckEvidenceBindingParticipant::class);
        $binding = EvidenceBinding::where('chapter_id', $chapterId)
            ->where('source_type', $sourceType)
            ->where('source_id', $sourceId)
            ->first();

        if (! $binding) {
            return false;
        }

        $result = $participant->check([
            'chapter_id' => $chapterId,
            'evidence_id' => $binding->evidence_id,
            'binding_id' => $binding->id,
            'source_type' => $sourceType,
            'source_id' => $sourceId,
            'recipient_name' => $recipientName,
            'lines' => $items,
        ], strict: false);

        return ($result['outcome'] ?? '') === 'ready';
    }
}
