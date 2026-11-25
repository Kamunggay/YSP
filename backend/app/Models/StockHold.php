<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockHold extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'stock_holds';

    protected $fillable = [
        'id',
        'chapter_id',
        'status',
        'version',
        'material_version',
        'reason_code',
        'reason',
        'placed_by_user_id',
        'placed_at',
        'clearance_proposal_json',
        'clearance_material_sha256',
        'clearance_prepared_by_user_id',
        'clearance_evidence_binding_id',
        'clearance_acknowledgment_json',
        'cleared_by_user_id',
        'cleared_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'placed_at' => 'datetime',
            'cleared_at' => 'datetime',
            'clearance_proposal_json' => 'array',
            'clearance_acknowledgment_json' => 'array',
        ];
    }

    public function ranges(): HasMany
    {
        return $this->hasMany(StockHoldRange::class, 'hold_id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(StockHoldHistory::class, 'hold_id')->orderBy('version');
    }
}
