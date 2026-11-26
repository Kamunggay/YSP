<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryMovement extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected $table = 'inventory_movements';

    protected $fillable = [
        'id',
        'posting_id',
        'chapter_id',
        'variant_id',
        'unit_id',
        'location_id',
        'condition',
        'quantity',
        'balance_after',
        'created_at',
        'movement_kind',
        'source_rm_id',
        'source_ipc_id',
        'source_ipc_line_id',
        'lot_id',
        'rm_reference',
        'rm_material_version',
        'ipc_reference',
        'ipc_material_version',
        'quantity_scale',
        'accepted_value',
        'currency',
        'posted_by',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:6',
            'balance_after' => 'decimal:6',
            'quantity_scale' => 'integer',
            'rm_material_version' => 'integer',
            'ipc_material_version' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function posting(): BelongsTo
    {
        return $this->belongsTo(InventoryPosting::class, 'posting_id');
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
}
