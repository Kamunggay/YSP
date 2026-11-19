<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Buyer extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'buyers';

    protected $fillable = [
        'chapter_id',
        'name',
        'organization_name',
        'contact_person',
        'phone',
        'email',
        'address',
    ];

    public function salesOrders(): HasMany
    {
        return $this->hasMany(SalesOrder::class, 'buyer_id');
    }
}
