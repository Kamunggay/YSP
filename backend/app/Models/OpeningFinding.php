<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class OpeningFinding extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected $table = 'opening_findings';

    protected $fillable = [
        'id',
        'chapter_id',
        'rm_id',
        'ipc_id',
        'ipc_line_id',
        'lot_id',
        'variant_id',
        'unit_id',
        'location_id',
        'condition',
        'quantity',
        'quantity_scale',
        'reason',
        'recorded_by',
        'recorded_at',
        'resolution',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:6',
            'quantity_scale' => 'integer',
            'recorded_at' => 'datetime',
        ];
    }
}
