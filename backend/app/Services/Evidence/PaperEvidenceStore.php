<?php

namespace App\Services\Evidence;

use App\Http\Requests\AuthInput;
use App\Models\EvidenceBlob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\FilesystemException;

final class PaperEvidenceStore
{
    public function __construct(private PaperEvidenceContent $content) {}

    public function store(string $actorId, string $attachmentId, string $bytes, string $sha256): string
    {
        $path = "uploads/{$actorId}/{$attachmentId}";
        $disk = Storage::disk('evidence');
        try {
            if (! $disk->put($path, $bytes)) {
                throw PaperEvidenceContent::unavailable();
            }

            $absolute = $disk->path($path);
            if (@hash_file('sha256', $absolute) !== $sha256) {
                throw PaperEvidenceContent::unavailable();
            }

            // Sync the bytes and directory entries before the database can publish the locator.
            $this->sync($absolute, 'rb');
            foreach (["uploads/{$actorId}", 'uploads', ''] as $directory) {
                $this->sync($disk->path($directory), 'r');
            }
        } catch (FilesystemException) {
            throw PaperEvidenceContent::unavailable();
        }

        return $path;
    }

    private function sync(string $path, string $mode): void
    {
        $stream = @fopen($path, $mode);
        if ($stream === false) {
            throw PaperEvidenceContent::unavailable();
        }
        try {
            if (! @fsync($stream)) {
                throw PaperEvidenceContent::unavailable();
            }
        } finally {
            fclose($stream);
        }
    }

    /** @return array{?string, ?string} Validated bytes or the reason they are unavailable. */
    public function check(EvidenceBlob $blob): array
    {
        $disk = Storage::disk('evidence');
        try {
            $root = rtrim($disk->path(''), DIRECTORY_SEPARATOR);
            if (! is_dir($root) || ! is_readable($root) || ! is_executable($root)) {
                throw PaperEvidenceContent::unavailable();
            }
            if (! $disk->fileExists($blob->payload_path)) {
                $directory = dirname($disk->path($blob->payload_path));
                while ($directory !== $root && ! is_dir($directory)) {
                    $directory = dirname($directory);
                }
                if (! is_readable($directory) || ! is_executable($directory)) {
                    throw PaperEvidenceContent::unavailable();
                }

                return [null, 'object_missing'];
            }
            $stream = $disk->readStream($blob->payload_path);
            if (! is_resource($stream)) {
                throw PaperEvidenceContent::unavailable();
            }
            try {
                $bytes = stream_get_contents($stream, (int) $blob->file_size + 1);
            } finally {
                fclose($stream);
            }
        } catch (FilesystemException) {
            throw PaperEvidenceContent::unavailable();
        }
        if ($bytes === false) {
            throw PaperEvidenceContent::unavailable();
        }
        if (strlen($bytes) !== (int) $blob->file_size || ! hash_equals($blob->sha256_hash, hash('sha256', $bytes))) {
            return [null, 'integrity_failed'];
        }
        if ($this->content->invalidReason($bytes, $blob->mime_type) !== null) {
            return [null, 'unsafe_content'];
        }

        return [$bytes, null];
    }

    /** @param iterable<EvidenceBlob> $blobs
     *  @return array{?string, ?string}
     */
    public function checkVersion(iterable $blobs, ?string $attachmentId = null): array
    {
        $selected = null;
        foreach ($blobs as $blob) {
            if (! $blob->payload_path) {
                return [null, 'object_missing'];
            }
            [$bytes, $reason] = $this->check($blob);
            if ($reason !== null) {
                return [null, $reason];
            }
            if ($blob->id === $attachmentId) {
                $selected = $bytes;
            }
        }

        return [$selected, null];
    }

    public function pruneUnpublished(): int
    {
        $disk = Storage::disk('evidence');
        $count = 0;
        foreach ($disk->directories('uploads') as $directory) {
            $actorId = basename($directory);
            if (! preg_match(AuthInput::UUID, $actorId)) {
                continue;
            }
            $count += DB::transaction(function () use ($actorId, $directory, $disk): int {
                // Publication holds this account's shared lock until its receipt and manifest commit.
                User::whereKey($actorId)->lockForUpdate()->first();
                $removed = 0;
                foreach ($disk->files($directory) as $path) {
                    if (preg_match(AuthInput::UUID, basename($path))
                        && ! EvidenceBlob::where('payload_path', $path)->sharedLock()->first(['id'])) {
                        if (! $disk->delete($path)) {
                            throw PaperEvidenceContent::unavailable();
                        }
                        $removed++;
                    }
                }

                return $removed;
            });
        }

        return $count;
    }
}
