<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActualIssueLine extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'allocated_quantity' => 'decimal:4',
        'issued_quantity' => 'decimal:4',
    ];

    public function actualIssue(): BelongsTo
    {
        return $this->belongsTo(ActualIssue::class, 'actual_issue_id');
    }
}
