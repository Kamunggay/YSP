<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HandoverReceipt extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'printed_at' => 'datetime',
    ];

    public function handover(): BelongsTo
    {
        return $this->belongsTo(Handover::class, 'handover_id');
    }
}
