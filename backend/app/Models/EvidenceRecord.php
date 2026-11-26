<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class EvidenceRecord extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    public function blobs(): HasMany
    {
        return $this->hasMany(EvidenceBlob::class, 'evidence_id');
    }

    public function latestBlob(): HasOne
    {
        return $this->hasOne(EvidenceBlob::class, 'evidence_id')->latestOfMany('version');
    }

    public function currentVersionBlob(): ?EvidenceBlob
    {
        return $this->blobs()->orderByDesc('version')->orderByRaw('position IS NULL')->orderBy('position')->orderBy('id')
            ->sharedLock()->first(['id', 'version_id', 'version', 'payload_path']);
    }

    /** @return Collection<int, EvidenceBlob> */
    public function versionBlobs(?int $version, array $columns = ['*']): Collection
    {
        return $this->blobs()->where('version', $version)->orderByRaw('position IS NULL')
            ->orderBy('position')->orderBy('id')->sharedLock()->get($columns);
    }

    /** @return Collection<int, EvidenceBlob> */
    public function exactVersion(string $id, array $columns = ['*']): Collection
    {
        $legacyPath = "evidence/{$this->chapter_id}/{$this->id}/{$id}/%";
        $version = $this->blobs()->where(fn ($query) => $query->where('version_id', $id)
            ->orWhere(fn ($query) => $query->whereNull('version_id')
                ->where(fn ($query) => $query->where('payload_path', 'like', $legacyPath)->orWhere('id', $id))))
            ->sharedLock()->value('version');

        return $this->versionBlobs($version, $columns)->filter(fn (EvidenceBlob $blob) => $this->versionId($blob) === $id)->values();
    }

    public function versionId(EvidenceBlob $blob): string
    {
        $legacyPrefix = "evidence/{$this->chapter_id}/{$this->id}/";
        $path = $blob->payload_path ?? '';

        return $blob->version_id ?? (str_starts_with($path, $legacyPrefix) ? basename(dirname($path)) : $blob->id);
    }
}
