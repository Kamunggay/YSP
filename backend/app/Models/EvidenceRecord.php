<?php

namespace App\Models;

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
}
