<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Handover extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'actual_handover_at' => 'datetime',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(HandoverLine::class, 'handover_id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(HandoverReceipt::class, 'handover_id');
    }
}
