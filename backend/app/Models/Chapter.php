<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Chapter extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    public function memberships(): HasMany
    {
        return $this->hasMany(ChapterMembership::class, 'chapter_id');
    }

    public function dutyGrants(): HasMany
    {
        return $this->hasMany(DutyGrant::class, 'chapter_id');
    }

    public function policyRecords(): HasMany
    {
        return $this->hasMany(PolicyRecord::class, 'chapter_id');
    }
}
