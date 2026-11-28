<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingDiscrepancy extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'quantity_scale' => 'integer',
            'damaged_quantity' => 'decimal:6',
            'rejected_quantity' => 'decimal:6',
            'supplier_notification' => 'array',
            'review_json' => 'array',
            'resolution' => 'array',
            'quarantined_lots_auto_cleared_on_source_close' => 'boolean',
        ];
    }

    public function receivingReport(): BelongsTo
    {
        return $this->belongsTo(ReceivingReport::class, 'rm_id');
    }

    public function replacementReceivingReport(): BelongsTo
    {
        return $this->belongsTo(ReceivingReport::class, 'replacement_rm_id');
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
