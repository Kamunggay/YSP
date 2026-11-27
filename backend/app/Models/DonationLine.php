<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DonationLine extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'line_number' => 'integer',
            'quantity_scale' => 'integer',
            'pledged_quantity' => 'decimal:6',
            'received_quantity' => 'decimal:6',
            'closed_short_quantity' => 'decimal:6',
            'outstanding_quantity' => 'decimal:6',
            'unit_value_php' => 'decimal:2',
            'pledged_value_php' => 'decimal:2',
            'initial_restrictions' => 'array',
            'restrictions' => 'array',
        ];
    }

    public function donation(): BelongsTo
    {
        return $this->belongsTo(Donation::class, 'da_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(CatalogueVariant::class, 'variant_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(CatalogueUnit::class, 'unit_id');
    }
}
