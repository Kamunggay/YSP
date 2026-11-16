<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PolicyRecord extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'rules_json' => 'array',
        'effective_from' => 'datetime',
        'effective_until' => 'datetime',
    ];

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }
}
