<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\PaperEvidenceUpload;
use App\Models\ActionReceipt;
use App\Models\AuditLog;
use App\Models\Chapter;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Services\Evidence\PaperEvidenceContent;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PaperEvidenceController extends Controller
{
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'application/pdf',
    ];

    /**
     * Strictly validate file integrity, non-emptiness, maximum size, and authentic magic bytes.
     */
    private function validateFile($file): ?JsonResponse
    {
        if (! $file || ! $file->isValid()) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_file_upload',
                    'message' => 'Uploaded file is invalid or corrupted.',
                ],
            ], 422);
        }

        $size = $file->getSize();
        if ($size === false || $size === 0) {
            return response()->json([
                'error' => [
                    'code' => 'file_empty',
                    'message' => 'Uploaded file is empty (0 bytes).',
                ],
            ], 422);
        }

        if ($size > 10 * 1024 * 1024) {
            return response()->json([
                'error' => [
                    'code' => 'file_too_large',
                    'message' => 'Uploaded file exceeds the maximum allowed size of 10MB.',
                ],
            ], 422);
        }

        $realPath = $file->getRealPath();
        if (! $realPath || ! file_exists($realPath)) {
            return response()->json([
                'error' => [
                    'code' => 'file_read_error',
                    'message' => 'Unable to read uploaded file.',
                ],
            ], 422);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->file($realPath);

        if (! in_array($detectedMime, self::ALLOWED_MIME_TYPES)) {
            return response()->json([
                'error' => [
                    'code' => 'unsupported_media_type',
                    'message' => "File media type '{$detectedMime}' is not allowed. Disguised or unsupported files are rejected.",
                ],
            ], 422);
        }

        // Verify magic byte signatures for JPEG, PNG, PDF
        $handle = fopen($realPath, 'rb');
        $header = fread($handle, 16);
        fclose($handle);

        $isPdf = str_starts_with($header, '%PDF-');
        $isPng = str_starts_with($header, "\x89PNG\r\n\x1a\n");
        $isJpg = str_starts_with($header, "\xFF\xD8\xFF");

        if (! $isPdf && ! $isPng && ! $isJpg) {
            return response()->json([
                'error' => [
                    'code' => 'disguised_file_rejected',
                    'message' => 'File signature (magic bytes) does not match expected JPEG, PNG, or PDF format.',
                ],
            ], 422);
        }

        return null;
    }

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
        $projectionTime = now('UTC')->startOfSecond();
        $record = new EvidenceRecord([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter_id,
            'evidence_type' => 'paper',
            'purpose' => $upload->purpose,
            'record_id' => $upload->recordId,
            'technical_state' => 'ready',
            'created_by' => $actor,
            'created_at' => $projectionTime,
        ]);
        $versionId = (string) Str::uuid();
        $blobs = new Collection;
        $attachmentIdentity = [];
        foreach ($upload->files as $index => $file) {
            $metadata = $content->validate($file['bytes'], $file['media_type'], $index);
            $attachmentIdentity[] = $metadata;
            $blobs->push(new EvidenceBlob([
                'id' => (string) Str::uuid(),
                'version_id' => $versionId,
                'version' => 1,
                'position' => $index + 1,
                'mime_type' => $metadata['media_type'],
                'file_size' => $metadata['byte_length'],
                'sha256_hash' => $metadata['sha256'],
                'created_by' => $actor,
                'created_at' => $projectionTime,
            ]));
        }

        $scope = ['chapter_id' => $chapter_id, 'user_id' => $actor, 'operation' => 'uploadPaperEvidence', 'key' => $upload->key];
        $fingerprint = CanonicalJson::sha256(['target' => $this->target($record), 'attachments' => $attachmentIdentity]);
        try {
            $receipt = ActionReceipt::record($scope, $fingerprint, 201, ['data' => $this->version($record, $blobs)]);
            if (! $receipt->wasRecentlyCreated) {
                return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
            }

            $target = $request->attributes->get('paper_evidence_target');
            $editable = match ($upload->purpose) {
                'opening_receipt' => in_array($target->status, ['DRAFT', 'INSPECTED', 'EVIDENCE_MATCHED'], true),
                'hold_clearance' => $target->status === 'active',
                'actual_issue' => in_array($target->status, ['prepared', 'acknowledged'], true),
            };
            if (! $editable) {
                throw new ContractException(409, 'target_locked', 'The evidence target is no longer editable.');
            }

            foreach ($blobs as $index => $blob) {
                $blob->payload_path = $store->store($actor, $blob->id, $upload->files[$index]['bytes'], $blob->sha256_hash);
            }
            $record->save();
            $record->blobs()->saveMany($blobs);
            AuditLog::create([
                'chapter_id' => $chapter_id,
                'user_id' => $actor,
                'action' => 'uploadPaperEvidence',
                'entity_type' => 'paper_evidence',
                'entity_id' => $record->id,
                'details' => ['version_id' => $versionId],
            ]);
            $outbox->recordIntent('stage1.paper-evidence.changed.v1', $chapter_id, $record->id, 1);
        } catch (QueryException) {
            throw PaperEvidenceContent::unavailable();
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'false']);
    }

    public function show(Request $request, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $version = $record->blobs()->max('version');
        $blobs = $this->versionBlobs($record, $version);
        if ($blobs->isEmpty()) {
            throw $this->notFound();
        }

        return response()->json(['data' => [
            'evidence_id' => $record->id,
            'chapter_id' => $record->chapter_id,
            'target' => $this->target($record),
            'current_version' => $this->version($record, $blobs, $this->checkVersion($blobs, $store)[1]),
        ]]);
    }

    public function versions(Request $request, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $data = [];
        foreach ($record->blobs()->orderBy('version')->orderBy('position')->orderBy('id')->get()->groupBy('version') as $blobs) {
            $data[] = $this->version($record, $blobs, $this->checkVersion($blobs, $store)[1]);
        }

        return response()->json(['data' => $data]);
    }

    public function replace(Request $request, string $chapter_id, string $evidence_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        $evidenceRecord = EvidenceRecord::where('id', $evidence_id)
            ->where('chapter_id', $targetChapterId)
            ->first();
        if (! $evidenceRecord) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence not found.']], 404);
        }

        $replacementReason = $request->input('replacement_reason');
        $files = $request->file('attachments');
        if (! $files) {
            $file = $request->file('attachment');
            $files = $file ? [$file] : [];
        } elseif (! is_array($files)) {
            $files = [$files];
        }

        if (empty($files)) {
            return response()->json(['error' => ['code' => 'invalid_input', 'message' => 'Attachments are required.']], 422);
        }

        // Strict file validation across all replacement attachments
        foreach ($files as $file) {
            if ($err = $this->validateFile($file)) {
                return $err;
            }
        }

        $latestBlob = EvidenceBlob::where('evidence_id', $evidence_id)->orderBy('version', 'desc')->first();
        $newVersion = $latestBlob ? $latestBlob->version + 1 : 1;
        $prevVersionId = $latestBlob ? $this->versionId($evidenceRecord, $latestBlob) : null;
        $newVersionId = (string) Str::uuid();

        // Mark superseded
        if ($latestBlob) {
            EvidenceBlob::where('evidence_id', $evidence_id)
                ->where('version', $latestBlob->version)
                ->update(['superseded_by_version_id' => $newVersionId]);
        }

        $userId = $request->user()->id;
        $attachmentsData = [];
        $pos = 1;

        foreach ($files as $file) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->file($file->getRealPath()) ?: $file->getMimeType();

            $rawContent = file_get_contents($file->getRealPath());
            $sha256 = hash('sha256', $rawContent);
            $fileSize = strlen($rawContent);
            $attachmentId = (string) Str::uuid();

            $path = "evidence/{$targetChapterId}/{$evidence_id}/{$newVersionId}/{$attachmentId}";
            Storage::disk('evidence')->put($path, $rawContent);

            EvidenceBlob::create([
                'id' => $attachmentId,
                'evidence_id' => $evidence_id,
                'version' => $newVersion,
                'supersedes_version_id' => $prevVersionId,
                'replacement_reason' => $replacementReason,
                'sha256_hash' => $sha256,
                'mime_type' => $mimeType,
                'file_size' => $fileSize,
                'payload_path' => $path,
                'raw_content' => $rawContent,
                'created_by' => $userId,
            ]);

            $attachmentsData[] = [
                'attachment_id' => $attachmentId,
                'position' => $pos++,
                'media_type' => $mimeType,
                'byte_length' => $fileSize,
                'sha256' => $sha256,
            ];
        }

        return response()->json([
            'data' => [
                'evidence_id' => $evidenceRecord->id,
                'chapter_id' => $evidenceRecord->chapter_id,
                'target' => [
                    'purpose' => $evidenceRecord->purpose ?? 'actual_issue',
                    'record_id' => $evidenceRecord->record_id,
                ],
                'version_id' => $newVersionId,
                'version' => $newVersion,
                'supersedes_version_id' => $prevVersionId,
                'superseded_by_version_id' => null,
                'technical_state' => 'ready',
                'invalid_reason' => null,
                'uploaded_by' => $userId,
                'uploaded_at' => now()->toIso8601ZuluString(),
                'replacement_reason' => $replacementReason,
                'attachments' => $attachmentsData,
            ],
        ], 201, ['Cache-Control' => 'no-store']);
    }

    public function showVersion(Request $request, string $chapter_id, string $evidence_id, string $version_id, PaperEvidenceStore $store): JsonResponse
    {
        $record = $request->attributes->get(EvidenceRecord::class);
        $blobs = $this->findVersion($record, $version_id);

        return response()->json(['data' => $this->version($record, $blobs, $this->checkVersion($blobs, $store)[1])]);
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
        [$bytes, $invalidReason] = $this->checkVersion($blobs, $store, $attachment_id);
        if ($invalidReason !== null) {
            throw PaperEvidenceContent::unavailable();
        }

        $extension = PaperEvidenceContent::EXTENSIONS[$attachment->mime_type];

        return response($bytes, 200, [
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => "attachment; filename=\"{$attachment_id}.{$extension}\"",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @return Collection<int, EvidenceBlob> */
    private function findVersion(EvidenceRecord $record, string $versionId): Collection
    {
        $legacyDirectory = "evidence/{$record->chapter_id}/{$record->id}/{$versionId}/%";
        $version = $record->blobs()->where(fn ($query) => $query->where('version_id', $versionId)
            ->orWhere(fn ($query) => $query->whereNull('version_id')
                ->where(fn ($query) => $query->where('payload_path', 'like', $legacyDirectory)->orWhere('id', $versionId))))
            ->value('version');
        $blobs = $this->versionBlobs($record, $version);
        if ($blobs->isEmpty() || $this->versionId($record, $blobs->first()) !== $versionId) {
            throw $this->notFound();
        }

        return $blobs;
    }

    /** @return Collection<int, EvidenceBlob> */
    private function versionBlobs(EvidenceRecord $record, ?int $version): Collection
    {
        return $record->blobs()->where('version', $version)->orderBy('position')->orderBy('id')->get();
    }

    /** @param Collection<int, EvidenceBlob> $blobs */
    private function checkVersion(Collection $blobs, PaperEvidenceStore $store, ?string $attachmentId = null): array
    {
        $selected = null;
        foreach ($blobs as $blob) {
            [$bytes, $reason] = $store->check($blob);
            if ($reason !== null) {
                return [null, $reason];
            }
            if ($blob->id === $attachmentId) {
                $selected = $bytes;
            }
        }

        return [$selected, null];
    }

    /** @param Collection<int, EvidenceBlob> $blobs */
    private function version(EvidenceRecord $record, Collection $blobs, ?string $invalidReason = null): array
    {
        $first = $blobs->first();

        return [
            'evidence_id' => $record->id,
            'chapter_id' => $record->chapter_id,
            'target' => $this->target($record),
            'version_id' => $this->versionId($record, $first),
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

    private function versionId(EvidenceRecord $record, EvidenceBlob $blob): string
    {
        $legacyPrefix = "evidence/{$record->chapter_id}/{$record->id}/";

        return $blob->version_id
            ?? (str_starts_with($blob->payload_path, $legacyPrefix) ? basename(dirname($blob->payload_path)) : $blob->id);
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
