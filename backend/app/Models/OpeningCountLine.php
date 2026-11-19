<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpeningCountLine extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'opening_count_lines';

    protected $fillable = [
        'id',
        'ipc_id',
        'variant_id',
        'unit_id',
        'location_id',
        'lot_code',
        'condition',
        'counted_quantity',
        'counter_user_id',
    ];

    protected function casts(): array
    {
        return [
            'counted_quantity' => 'decimal:4',
        ];
    }

    public function ipc(): BelongsTo
    {
        return $this->belongsTo(OpeningCount::class, 'ipc_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(CatalogueVariant::class, 'variant_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(CatalogueUnit::class, 'unit_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(CatalogueLocation::class, 'location_id');
    }

    public function counterUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counter_user_id');
    }
}
