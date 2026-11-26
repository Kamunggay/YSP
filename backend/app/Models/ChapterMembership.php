<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChapterMembership extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = ['effective_from' => 'immutable_datetime'];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where('membership_status', 'active')->where(fn (Builder $query) => $query
            ->whereNull('effective_from')->orWhere('effective_from', '<=', now()->format('Y-m-d H:i:s.u')));
    }

    public function isCurrent(): bool
    {
        return $this->membership_status === 'active' && ! $this->effective_from?->isFuture();
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
