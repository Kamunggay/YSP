<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BrowserMfaReceipt extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['fingerprint', 'delivery'];

    protected $casts = [
        'result' => 'array',
        'delivery' => 'encrypted:array',
        'delivery_expires_at' => 'immutable_datetime',
    ];

    public static function eraseDelivery(?string $setId): void
    {
        if ($setId !== null) {
            self::where('recovery_set_id', $setId)->whereNotNull('delivery')->update(['delivery' => null]);
        }
    }
}
