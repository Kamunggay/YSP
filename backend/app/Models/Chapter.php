<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Chapter extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected static function booted(): void
    {
        static::created(function (self $chapter): void {
            $now = now('UTC');
            DB::table('chapter_opening_guards')->insertOrIgnore([
                'chapter_id' => $chapter->id,
                'stock_version' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        });
    }

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
