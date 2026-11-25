<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
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

    public function upload(Request $request, string $chapter_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        $purpose = $request->input('purpose');
        $recordId = $request->input('record_id');

        if (! $purpose || ! $recordId) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'Purpose and record_id are required.',
                ],
            ], 422);
        }

        $files = $request->file('attachments');
        if (! $files) {
            // Check if uploaded as single attachment or raw content
            $file = $request->file('attachment');
            $files = $file ? [$file] : [];
        } elseif (! is_array($files)) {
            $files = [$files];
        }

        if (empty($files)) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'At least one attachment file is required.',
                ],
            ], 422);
        }

        // Strict file validation across all attachments
        foreach ($files as $file) {
            if ($err = $this->validateFile($file)) {
                return $err;
            }
        }

        $userId = $request->user()->id;
        $evidenceId = (string) Str::uuid();
        $versionId = (string) Str::uuid();

        $evidenceRecord = EvidenceRecord::create([
            'id' => $evidenceId,
            'chapter_id' => $targetChapterId,
            'evidence_type' => 'paper',
            'purpose' => $purpose,
            'record_id' => $recordId,
            'technical_state' => 'ready',
            'created_by' => $userId,
        ]);

        $attachmentsData = [];
        $position = 1;

        foreach ($files as $file) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->file($file->getRealPath()) ?: $file->getMimeType();

            $rawContent = file_get_contents($file->getRealPath());
            $sha256 = hash('sha256', $rawContent);
            $fileSize = strlen($rawContent);
            $attachmentId = (string) Str::uuid();

            $path = "evidence/{$targetChapterId}/{$evidenceId}/{$versionId}/{$attachmentId}";
            Storage::disk('evidence')->put($path, $rawContent);

            EvidenceBlob::create([
                'id' => $attachmentId,
                'evidence_id' => $evidenceId,
                'version' => 1,
                'sha256_hash' => $sha256,
                'mime_type' => $mimeType,
                'file_size' => $fileSize,
                'payload_path' => $path,
                'raw_content' => $rawContent,
                'created_by' => $userId,
            ]);

            $attachmentsData[] = [
                'attachment_id' => $attachmentId,
                'position' => $position++,
                'media_type' => $mimeType,
                'byte_length' => $fileSize,
                'sha256' => $sha256,
            ];
        }

        return response()->json([
            'data' => [
                'evidence_id' => $evidenceId,
                'chapter_id' => $targetChapterId,
                'target' => [
                    'purpose' => $purpose,
                    'record_id' => $recordId,
                ],
                'version_id' => $versionId,
                'version' => 1,
                'supersedes_version_id' => null,
                'superseded_by_version_id' => null,
                'technical_state' => 'ready',
                'invalid_reason' => null,
                'uploaded_by' => $userId,
                'uploaded_at' => $evidenceRecord->created_at->toIso8601ZuluString(),
                'replacement_reason' => null,
                'attachments' => $attachmentsData,
            ],
        ], 201, ['Cache-Control' => 'no-store']);
    }

    public function show(string $chapter_id, string $evidence_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        $evidenceRecord = EvidenceRecord::where('id', $evidence_id)
            ->where('chapter_id', $targetChapterId)
            ->first();
        if (! $evidenceRecord) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence not found.']], 404);
        }

        $blobs = EvidenceBlob::where('evidence_id', $evidence_id)->orderBy('version', 'desc')->get();
        if ($blobs->isEmpty()) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence version not found.']], 404);
        }

        $latestBlob = $blobs->first();
        $latestVersionBlobs = $blobs->where('version', $latestBlob->version);

        $attachments = [];
        $pos = 1;
        foreach ($latestVersionBlobs as $b) {
            $attachments[] = [
                'attachment_id' => $b->id,
                'position' => $pos++,
                'media_type' => $b->mime_type,
                'byte_length' => (int) $b->file_size,
                'sha256' => $b->sha256_hash,
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
                'current_version' => [
                    'evidence_id' => $evidenceRecord->id,
                    'chapter_id' => $evidenceRecord->chapter_id,
                    'target' => [
                        'purpose' => $evidenceRecord->purpose ?? 'actual_issue',
                        'record_id' => $evidenceRecord->record_id,
                    ],
                    'version_id' => $latestBlob->id,
                    'version' => (int) $latestBlob->version,
                    'supersedes_version_id' => $latestBlob->supersedes_version_id,
                    'superseded_by_version_id' => $latestBlob->superseded_by_version_id,
                    'technical_state' => $evidenceRecord->technical_state,
                    'invalid_reason' => $evidenceRecord->invalid_reason,
                    'uploaded_by' => $latestBlob->created_by,
                    'uploaded_at' => $latestBlob->created_at->toIso8601ZuluString(),
                    'replacement_reason' => $latestBlob->replacement_reason,
                    'attachments' => $attachments,
                ],
            ],
        ]);
    }

    public function versions(string $chapter_id, string $evidence_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        $evidenceRecord = EvidenceRecord::where('id', $evidence_id)
            ->where('chapter_id', $targetChapterId)
            ->first();
        if (! $evidenceRecord) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence not found.']], 404);
        }

        $blobs = EvidenceBlob::where('evidence_id', $evidence_id)->orderBy('version', 'asc')->get();
        $versionsGrouped = $blobs->groupBy('version');

        $data = [];
        foreach ($versionsGrouped as $ver => $groupBlobs) {
            $first = $groupBlobs->first();
            $attachments = [];
            $pos = 1;
            foreach ($groupBlobs as $b) {
                $attachments[] = [
                    'attachment_id' => $b->id,
                    'position' => $pos++,
                    'media_type' => $b->mime_type,
                    'byte_length' => (int) $b->file_size,
                    'sha256' => $b->sha256_hash,
                ];
            }

            $data[] = [
                'evidence_id' => $evidenceRecord->id,
                'chapter_id' => $evidenceRecord->chapter_id,
                'target' => [
                    'purpose' => $evidenceRecord->purpose ?? 'actual_issue',
                    'record_id' => $evidenceRecord->record_id,
                ],
                'version_id' => $first->id,
                'version' => (int) $ver,
                'supersedes_version_id' => $first->supersedes_version_id,
                'superseded_by_version_id' => $first->superseded_by_version_id,
                'technical_state' => $evidenceRecord->technical_state,
                'invalid_reason' => $evidenceRecord->invalid_reason,
                'uploaded_by' => $first->created_by,
                'uploaded_at' => $first->created_at->toIso8601ZuluString(),
                'replacement_reason' => $first->replacement_reason,
                'attachments' => $attachments,
            ];
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
        $prevVersionId = $latestBlob ? $latestBlob->id : null;
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

    public function showVersion(string $chapter_id, string $evidence_id, string $version_id): JsonResponse
    {
        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        $evidenceRecord = EvidenceRecord::where('id', $evidence_id)
            ->where('chapter_id', $targetChapterId)
            ->first();
        if (! $evidenceRecord) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence not found.']], 404);
        }

        $blob = EvidenceBlob::where('evidence_id', $evidence_id)
            ->where(function ($q) use ($version_id) {
                $q->where('id', $version_id)->orWhere('version', $version_id);
            })
            ->first();

        if (! $blob) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence version not found.']], 404);
        }

        $allVersionBlobs = EvidenceBlob::where('evidence_id', $evidence_id)
            ->where('version', $blob->version)
            ->get();

        $attachments = [];
        $pos = 1;
        foreach ($allVersionBlobs as $b) {
            $attachments[] = [
                'attachment_id' => $b->id,
                'position' => $pos++,
                'media_type' => $b->mime_type,
                'byte_length' => (int) $b->file_size,
                'sha256' => $b->sha256_hash,
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
                'version_id' => $blob->id,
                'version' => (int) $blob->version,
                'supersedes_version_id' => $blob->supersedes_version_id,
                'superseded_by_version_id' => $blob->superseded_by_version_id,
                'technical_state' => $evidenceRecord->technical_state,
                'invalid_reason' => $evidenceRecord->invalid_reason,
                'uploaded_by' => $blob->created_by,
                'uploaded_at' => $blob->created_at->toIso8601ZuluString(),
                'replacement_reason' => $blob->replacement_reason,
                'attachments' => $attachments,
            ],
        ]);
    }

    public function retrieveAttachment(Request $request, string $chapter_id, string $evidence_id, string $version_id, string $attachment_id): Response|JsonResponse
    {
        $userId = $request->user()->id;
        if (! $userId) {
            return response()->json([
                'error' => 'AUTHENTICATION_REQUIRED',
                'message' => 'Caller identity or active session is required to retrieve evidence attachments.',
            ], 401);
        }

        $chapter = Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();
        $targetChapterId = $chapter ? $chapter->id : $chapter_id;

        // Verify chapter membership
        $membership = ChapterMembership::where('chapter_id', $targetChapterId)
            ->where('user_id', $userId)
            ->where('membership_status', 'active')
            ->first();

        if (! $membership) {
            return response()->json([
                'error' => 'MEMBERSHIP_REQUIRED',
                'message' => "User does not have an active membership in chapter {$targetChapterId}.",
            ], 403);
        }

        $evidenceRecord = EvidenceRecord::where('id', $evidence_id)
            ->where('chapter_id', $targetChapterId)
            ->first();

        if (! $evidenceRecord) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Evidence record not found.']], 404);
        }

        $blob = EvidenceBlob::where('evidence_id', $evidence_id)
            ->where('id', $attachment_id)
            ->first();

        if (! $blob) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Attachment not found.']], 404);
        }

        $content = null;
        if (Storage::disk('evidence')->exists($blob->payload_path)) {
            $content = Storage::disk('evidence')->get($blob->payload_path);
        } elseif ($blob->raw_content) {
            $content = $blob->raw_content;
        } elseif (Storage::disk('local')->exists($blob->payload_path)) {
            $content = Storage::disk('local')->get($blob->payload_path);
        }

        if ($content === null) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Attachment content not found.']], 404);
        }

        return response($content, 200, [
            'Content-Type' => $blob->mime_type,
            'Content-Disposition' => "inline; filename=\"attachment-{$attachment_id}\"",
            'Cache-Control' => 'no-store',
        ]);
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
