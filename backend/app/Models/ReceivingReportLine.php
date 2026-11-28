<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingReportLine extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'line_number' => 'integer',
            'quantity_scale' => 'integer',
            'delivered_quantity' => 'decimal:6',
            'accepted_quantity' => 'decimal:6',
            'damaged_quantity' => 'decimal:6',
            'rejected_quantity' => 'decimal:6',
            'unit_valuation_php' => 'decimal:2',
            'accepted_value_php' => 'decimal:2',
            'restrictions' => 'array',
        ];
    }

    public function receivingReport(): BelongsTo
    {
        return $this->belongsTo(ReceivingReport::class, 'rm_id');
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
