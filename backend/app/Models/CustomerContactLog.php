<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerContactLog extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'customer_contact_logs';

    protected $fillable = [
        'so_id',
        'contact_timestamp',
        'contact_method',
        'officer_id',
        'buyer_response',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'contact_timestamp' => 'datetime',
        ];
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'so_id');
    }
}
