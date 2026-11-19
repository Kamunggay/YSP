<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryPosting extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'inventory_postings';

    protected $fillable = [
        'id',
        'chapter_id',
        'posting_reference',
        'source_type',
        'source_id',
        'actor_id',
        'notes',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class, 'posting_id');
    }
}
