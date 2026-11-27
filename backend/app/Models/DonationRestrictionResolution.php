<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DonationRestrictionResolution extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'previous_restrictions' => 'array',
            'restrictions' => 'array',
            'updated_lot_ids' => 'array',
            'binding' => 'array',
            'snapshot' => 'array',
            'signed_at' => 'immutable_datetime',
            'committed_at' => 'immutable_datetime',
        ];
    }

    public function donation(): BelongsTo
    {
        return $this->belongsTo(Donation::class, 'da_id');
    }

    public function line(): BelongsTo
    {
        return $this->belongsTo(DonationLine::class, 'da_line_id');
    }
}
